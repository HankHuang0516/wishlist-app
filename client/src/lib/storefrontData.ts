import { parsePublicListing, type PublicListing } from './listingSearch';
export type Storefront={seller:{id:number;name:string|null;avatarUrl:string|null;joinedAt:string;emailVerified:boolean};items:PublicListing[];nextCursor:string|null;isFollowing:boolean;blockedByMe:boolean;blockedByOther:boolean};
export function parseStorefront(value:unknown,id:number,apiUrl:string,local=false):Storefront {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid storefront');const r=value as Storefront,s=r.seller;
 if(!s||s.id!==id||!Number.isSafeInteger(id)||id<1||!(s.name===null||typeof s.name==='string'&&s.name.length<=100)||typeof s.joinedAt!=='string'||!Number.isFinite(Date.parse(s.joinedAt))||typeof s.emailVerified!=='boolean'||![r.isFollowing,r.blockedByMe,r.blockedByOther].every(x=>typeof x==='boolean')||!Array.isArray(r.items)||r.items.length>24||!(r.nextCursor===null||typeof r.nextCursor==='string'&&/^[a-f0-9-]{36}$/i.test(r.nextCursor)))throw Error('Invalid storefront');
 if(s.avatarUrl!==null){if(typeof s.avatarUrl!=='string'||s.avatarUrl.length>2048)throw Error('Invalid avatar');if(!/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(s.avatarUrl)){const u=new URL(s.avatarUrl);if(u.protocol!=='https:'||u.username||u.password)throw Error('Invalid avatar');}}
 const items=r.items.map(v=>parsePublicListing(v,apiUrl,local));
 if(items.some(i=>i.owner.id!==id)||new Set(items.map(i=>i.id)).size!==items.length||r.nextCursor!==null&&r.nextCursor!==items.at(-1)?.id)throw Error('Invalid storefront items');
 return {seller:{id:s.id,name:s.name,avatarUrl:s.avatarUrl,joinedAt:s.joinedAt,emailVerified:s.emailVerified},items,nextCursor:r.nextCursor,isFollowing:r.isFollowing,blockedByMe:r.blockedByMe,blockedByOther:r.blockedByOther};
}
