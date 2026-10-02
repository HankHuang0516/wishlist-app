import { api } from './marketplaceApi';
import { sha256, type PendingStore } from './webPendingStore';

export const profileFlags = ['isAvatarVisible', 'isPhoneVisible', 'isRealNameVisible', 'isAddressVisible', 'isEmailVisible', 'isBirthdayVisible', 'marketingEmailsEnabled'] as const;
export const profileText = ['nicknames', 'realName', 'address', 'birthday', 'email'] as const;
export type ProfileField = typeof profileFlags[number] | typeof profileText[number];
export type ProfilePatch = Partial<Record<ProfileField, string | boolean | null>>;
export type OwnProfile = { id: number; profileVersion: number; name: string | null; phoneNumber: string; nicknames: string; realName: string | null; address: string | null; birthday: string | null; email: string | null; avatarUrl: string | null; isPremium: boolean; apiKey?: string } & Record<typeof profileFlags[number], boolean>;
export class ProfileError extends Error {}
const fail = () => { throw new ProfileError('帳號資料或儲存回執不正確，請重新查核'); };
export function parseOwnProfile(raw: unknown, userId: number): OwnProfile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail();
  const row = raw as Record<string, unknown>;
  if (row.id !== userId || !Number.isSafeInteger(row.profileVersion) || Number(row.profileVersion) < 0 || Number(row.profileVersion) > 2147483647 || typeof row.phoneNumber !== 'string' || !row.phoneNumber || row.phoneNumber.length > 200 || typeof row.isPremium !== 'boolean' || profileFlags.some(key => typeof row[key] !== 'boolean')) return fail();
  const text = (key: string, max: number) => { const value = row[key]; if (value == null) return null; if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) return fail(); return value; };
  const birthday = text('birthday', 24);
  if (birthday && (!/^\d{4}-\d{2}-\d{2}(?:T00:00:00.000Z)?$/.test(birthday) || !Number.isFinite(Date.parse(birthday)) || new Date(birthday).toISOString().slice(0,10) !== birthday.slice(0,10))) return fail();
  const avatarUrl = text('avatarUrl', 2048);
  if (avatarUrl && !/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(avatarUrl)) {
    try { const url = new URL(avatarUrl); if (url.protocol !== 'https:' || url.username || url.password) return fail(); } catch { return fail(); }
  }
  return { id: userId, profileVersion: Number(row.profileVersion), name: text('name',50), phoneNumber: row.phoneNumber,
    nicknames: text('nicknames',254) ?? '', realName: text('realName',100), address: text('address',500), birthday: birthday?.slice(0,10) ?? null,
    email: text('email',254), avatarUrl, isPremium: row.isPremium, ...Object.fromEntries(profileFlags.map(key => [key,row[key]])) } as OwnProfile;
}
export function normalizeProfilePatch(raw: unknown): ProfilePatch {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail();
  const row = raw as Record<string, unknown>, keys = Object.keys(row).sort(), result: ProfilePatch = {};
  if (!keys.length || keys.some(key => ![...profileFlags,...profileText].includes(key as ProfileField))) return fail();
  for (const key of keys as ProfileField[]) {
    const value = row[key];
    if (profileFlags.includes(key as typeof profileFlags[number])) { if (typeof value !== 'boolean') return fail(); result[key] = value; continue; }
    if (value !== null && (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value) || new TextDecoder().decode(new TextEncoder().encode(value)) !== value)) return fail();
    let text = typeof value === 'string' ? value.trim() : '';
    const limit = key === 'address' ? 500 : key === 'realName' ? 100 : 254;
    if (text.length > limit) throw new ProfileError(`${key === 'address' ? '地址' : key === 'realName' ? '姓名' : key === 'email' ? '信箱' : '暱稱'}超過${limit}字`);
    if (key === 'nicknames') { const parts = text.split(',').map(part => part.trim()).filter(Boolean); if (parts.length > 5 || parts.some(part => part.length > 50)) throw new ProfileError('最多5個暱稱，每個50字內'); text = parts.join(','); }
    if (key === 'birthday' && text && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text < '1900-01-01' || text > new Date().toISOString().slice(0,10) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0,10) !== text)) throw new ProfileError('生日須為有效日期，且不可晚於今天');
    if (key === 'email' && (!text || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))) throw new ProfileError('請輸入有效的電子信箱');
    result[key] = key === 'nicknames' ? text : text || null;
  }
  return result;
}
export type ProfileJournal = { version: 1; clientActionId: string; expectedVersion: number; updates: ProfilePatch; requestHash: string };
export async function profileJournal(updates: ProfilePatch, expectedVersion: number, clientActionId = crypto.randomUUID()): Promise<string> {
  const patch = normalizeProfilePatch(updates), requestHash = await sha256(JSON.stringify({ expectedVersion, updates: patch }));
  const raw = JSON.stringify({ version: 1, clientActionId, expectedVersion, updates: patch, requestHash });
  await parseProfileJournal(raw); return raw;
}
export async function parseProfileJournal(raw: string): Promise<ProfileJournal> {
  let value; try { value = JSON.parse(raw); } catch { return fail(); }
  if (!value || Object.keys(value).sort().join(',') !== 'clientActionId,expectedVersion,requestHash,updates,version' || value.version !== 1 || typeof value.clientActionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.clientActionId) || !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0 || value.expectedVersion >= 2147483647) return fail();
  const updates = normalizeProfilePatch(value.updates);
  if (JSON.stringify(updates) !== JSON.stringify(value.updates) || value.requestHash !== await sha256(JSON.stringify({ expectedVersion: value.expectedVersion, updates }))) return fail();
  return value;
}
export type ProfileResult = { state: 'APPLIED' | 'CONFLICT' | 'ABANDONED'; current: boolean; profile: OwnProfile };
export async function profileResult(value: unknown, raw: string, userId: number): Promise<ProfileResult> {
  const journal = await parseProfileJournal(raw), row = value as Record<string, any>, receipt = row?.receipt;
  const profile = parseOwnProfile(row?.profile, userId);
  if (!receipt || receipt.clientActionId !== journal.clientActionId || receipt.requestHash !== journal.requestHash || !['APPLIED','CONFLICT','ABANDONED'].includes(receipt.state) || typeof receipt.createdAt !== 'string' || !Number.isFinite(Date.parse(receipt.createdAt)) || new Date(receipt.createdAt).toISOString() !== receipt.createdAt || (receipt.state === 'APPLIED' ? receipt.appliedVersion !== journal.expectedVersion + 1 || profile.profileVersion < receipt.appliedVersion : receipt.appliedVersion !== null)) return fail();
  const current = receipt.state === 'APPLIED' && profile.profileVersion === receipt.appliedVersion;
  if (current && Object.entries(journal.updates).some(([key,val]) => profile[key as ProfileField] !== val)) return fail();
  return { state: receipt.state, current, profile };
}
export async function readProfileOperation(token: string, raw: string, userId: number) {
  const journal = await parseProfileJournal(raw);
  return profileResult(await api(token, '/users/me/profile-operations/' + journal.clientActionId), raw, userId);
}
export async function sendProfileOperation(token: string, raw: string, userId: number, store: PendingStore, key: string, active: () => boolean) {
  const journal = await parseProfileJournal(raw);
  await store.save(key,raw); if (!active()) throw new ProfileError('已離開此帳號，不會送出');
  return profileResult(await api(token, '/users/me/profile-operations/' + journal.clientActionId, { method:'POST',body:JSON.stringify({expectedVersion:journal.expectedVersion,updates:journal.updates}) }),raw,userId);
}
export async function abandonProfileOperation(token: string, raw: string, userId: number, active: () => boolean = () => true) {
  const journal = await parseProfileJournal(raw);
  if (!active()) throw new ProfileError('已離開此帳號，不會停止操作');
  return profileResult(await api(token,'/users/me/profile-operations/' + journal.clientActionId + '/abandon',{method:'POST',body:JSON.stringify({requestHash:journal.requestHash})}),raw,userId);
}
