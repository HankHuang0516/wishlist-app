import { API_BASE_URL } from '../config';
export type SocialUser = { id: number; name: string | null; phoneNumber: string | null; nicknames: string | null; avatarUrl: string | null; birthday: string | null; isFollowing?: boolean; isMutual?: boolean };
export function socialAvatar(value: string | null) {
    if (!value) return undefined;
    if (/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(value)) return API_BASE_URL + value;
    try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return url.href; } catch { /* reject unsafe URLs */ }
    throw new Error('Invalid social photo');
}
export function parseSocialUsers(raw: unknown, kind: 'search' | 'following'): SocialUser[] {
    if (!Array.isArray(raw) || kind === 'search' && raw.length > 20) throw new Error('Invalid social response');
    const seen = new Set<number>();
    return raw.map(value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid social user');
        const row = value as Record<string, unknown>;
        if (!Number.isSafeInteger(row.id) || Number(row.id) < 1 || Number(row.id) > 2147483647 || seen.has(Number(row.id))) throw new Error('Invalid social identity');
        seen.add(Number(row.id));
        const text = (key: string, max: number) => { const val = row[key]; if (val === null) return null; if (typeof val !== 'string' || val.length > max || /[\u0000-\u001f\u007f]/.test(val)) throw new Error('Invalid social field'); return val; };
        const result: SocialUser = { id: Number(row.id), name: text('name', 50), nicknames: text('nicknames',254), phoneNumber: text('phoneNumber',200), avatarUrl: text('avatarUrl',2048), birthday: text('birthday',24) };
        socialAvatar(result.avatarUrl);
        if (result.birthday && (!/^\d{4}-\d{2}-\d{2}T00:00:00.000Z$/.test(result.birthday) || !Number.isFinite(Date.parse(result.birthday)) || new Date(result.birthday).toISOString() !== result.birthday)) throw new Error('Invalid birthday');
        const flag = kind === 'search' ? 'isFollowing' : 'isMutual';
        if (typeof row[flag] !== 'boolean') throw new Error('Invalid relationship');
        result[flag] = row[flag];
        return result;
    });
}

export type PublicProfile=Pick<SocialUser,'id'|'name'|'nicknames'|'phoneNumber'|'avatarUrl'|'birthday'> & {realName:string|null;address:string|null;isFollowing:boolean};
export function parsePublicProfile(value:unknown,targetId:number):PublicProfile{
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid public profile');
    const row=value as Record<string,unknown>;
    const card=parseSocialUsers([{id:row.id,name:row.name,nicknames:row.nicknames,phoneNumber:row.phoneNumber,avatarUrl:row.avatarUrl,birthday:row.birthday,isFollowing:row.isFollowing}],'search')[0];
    if(card.id!==targetId)throw Error('Wrong profile identity');
    const field=(key:string,max:number)=>{const val=row[key];if(val===null)return null;if(typeof val!=='string'||val.length>max||/[\u0000-\u001f\u007f]/.test(val))throw Error('Invalid profile field');return val;};
    return {...card,realName:field('realName',100),address:field('address',500),isFollowing:row.isFollowing as boolean};
}
