import { socialAvatar } from './socialWeb';

export type BirthdayReminder = { id: number; name: string | null; nicknames: string | null; avatarUrl: string | null; birthday: string; nextBirthday: string };
function date(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
    throw Error('Invalid birthday date');
  return value;
}
export function parseBirthdayReminders(value: unknown): BirthdayReminder[] {
  if (!Array.isArray(value)) throw Error('Invalid birthday response');
  const seen = new Set<number>();
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid birthday reminder');
    const row = raw as Record<string, unknown>;
    const fields = ['id', 'name', 'nicknames', 'avatarUrl', 'birthday', 'nextBirthday'];
    if (Object.keys(row).length !== fields.length || fields.some(key => !Object.hasOwn(row, key))) throw Error('Invalid birthday fields');
    if (!Number.isSafeInteger(row.id) || Number(row.id) < 1 || Number(row.id) > 2147483647 || seen.has(Number(row.id))) throw Error('Invalid birthday identity');
    seen.add(Number(row.id));
    const text = (key: string, max: number) => {
      const entry = row[key];
      if (entry === null) return null;
      if (typeof entry !== 'string' || entry.length > max || /[\u0000-\u001f\u007f]/.test(entry)) throw Error('Invalid birthday text');
      return entry;
    };
    const birthday = date(row.birthday), nextBirthday = date(row.nextBirthday);
    const born = new Date(birthday), next = new Date(nextBirthday);
    // Retain the existing Feb 29 -> Mar 1 behavior in non-leap years.
    const expected = new Date(Date.UTC(next.getUTCFullYear(), born.getUTCMonth(), born.getUTCDate()));
    if (expected.toISOString() !== nextBirthday) throw Error('Invalid birthday occurrence');
    const avatarUrl = text('avatarUrl', 2048); socialAvatar(avatarUrl);
    return { id: Number(row.id), name: text('name', 50), nicknames: text('nicknames', 254), avatarUrl, birthday, nextBirthday };
  });
}
