import * as Crypto from 'expo-crypto';
const hash=(v:string)=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,v),newId=()=>Crypto.randomUUID();
export type NotificationPreferences={chat:boolean;meetup:boolean;sourceReply:boolean;preview:boolean;version:number};
export type NotificationJournal={version:1;clientActionId:string;expectedVersion:number;preferences:Omit<NotificationPreferences,'version'>;requestHash:string};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export function parseNotificationPreferences(value:unknown):NotificationPreferences{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid notification preferences');const r=value as NotificationPreferences;
 if(!Number.isSafeInteger(r.version)||r.version<0||r.version>2147483647||![r.chat,r.meetup,r.sourceReply,r.preview].every(v=>typeof v==='boolean'))throw Error('Invalid notification preferences');
 return {chat:r.chat,meetup:r.meetup,sourceReply:r.sourceReply,preview:r.preview,version:r.version};
}
const payload=(r:NotificationJournal)=>({expectedVersion:r.expectedVersion,preferences:{chat:r.preferences.chat,meetup:r.preferences.meetup,sourceReply:r.preferences.sourceReply,preview:r.preferences.preview}});
export async function makeNotificationJournal(current:NotificationPreferences,key:keyof Omit<NotificationPreferences,'version'>,value:boolean){
 const {version,...preferences}=parseNotificationPreferences(current);const request={version:1 as const,clientActionId:newId(),expectedVersion:version,preferences:{...preferences,[key]:value},requestHash:''};request.requestHash=await hash(JSON.stringify(payload(request)));return JSON.stringify(request);
}
export async function parseNotificationJournal(raw:string):Promise<NotificationJournal>{
 const r=JSON.parse(raw) as NotificationJournal;if(!r||Object.keys(r).sort().join(',')!=='clientActionId,expectedVersion,preferences,requestHash,version'||r.version!==1||!uuid(r.clientActionId)||Object.keys(r.preferences??{}).sort().join(',')!=='chat,meetup,preview,sourceReply'||typeof r.requestHash!=='string'||!/^[a-f0-9]{64}$/.test(r.requestHash))throw Error('Invalid notification journal');
 parseNotificationPreferences({...r.preferences,version:r.expectedVersion});if(await hash(JSON.stringify(payload(r)))!==r.requestHash)throw Error('Invalid notification checksum');return r;
}
export function notificationPayload(request:NotificationJournal){return payload(request);}
export async function parseNotificationResult(value:unknown,raw:string){
 const request=await parseNotificationJournal(raw),r=value as {receipt?:{clientActionId:string;requestHash:string;state:string;appliedVersion:number|null;createdAt:string};current:unknown},p=r?.receipt;
 if(!p||p.clientActionId!==request.clientActionId||p.requestHash!==request.requestHash||!['APPLIED','CONFLICT','ABANDONED'].includes(p.state)||typeof p.createdAt!=='string'||!Number.isFinite(Date.parse(p.createdAt))||(p.state==='APPLIED'?p.appliedVersion!==request.expectedVersion+1:p.appliedVersion!==null))throw Error('Notification result unconfirmed');
 const current=parseNotificationPreferences(r.current);if(p.appliedVersion!==null&&(current.version<p.appliedVersion||current.version===p.appliedVersion&&JSON.stringify({...current,version:undefined})!==JSON.stringify({...request.preferences,version:undefined})))throw Error('Notification preference mismatch');return {state:p.state,current};
}
