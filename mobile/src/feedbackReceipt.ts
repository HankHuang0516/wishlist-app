import * as Crypto from 'expo-crypto';
const sha256=(value:string)=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,value);
export class FeedbackError extends Error {}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export type FeedbackJournal={version:1;clientSubmissionId:string;userId:number|null;content:string;email:string;language:string;requestHash:string};
export type FeedbackReceipt={received:true;clientSubmissionId:string;requestHash:string;inquiryId:string;notificationStatus:'ACCEPTED'|'FAILED'|'PENDING'|'UNKNOWN'};
async function hash(content:string,email:string,userId:number|null){return sha256(JSON.stringify({kind:'FEEDBACK',payload:{content:content.trim(),userId,contactEmail:userId===null?email.trim().toLowerCase():null}}));}
function replyMailbox(value:string){
 if(value.length>254||/[\u0000-\u0020\u007f]/u.test(value))return false;
 const parts=value.split('@');if(parts.length!==2)return false;const [local,domain]=parts;
 return local.length>0&&local.length<=64&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)&&!local.startsWith('.')&&!local.endsWith('.')&&!local.includes('..')&&domain.length<=253&&domain.includes('.')&&domain.split('.').every(label=>/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}
function fields(content:unknown,email:unknown,userId:unknown){
 if(typeof content!=='string'||!content.trim()||content.length>5000||typeof email!=='string'||email.length>254||userId!==null&&(!Number.isSafeInteger(userId)||Number(userId)<1||Number(userId)>2147483647)||userId===null&&!replyMailbox(email))throw new FeedbackError('INPUT');
}
export async function feedbackJournal(content:string,email:string,userId:number|null,language:string){
 fields(content,email,userId);
 return JSON.stringify({version:1,clientSubmissionId:Crypto.randomUUID(),userId,content,email:userId===null?email:'',language,requestHash:await hash(content,email,userId)});
}
export async function parseFeedbackJournal(raw:string,userId:number|null):Promise<FeedbackJournal>{
 if(raw.length>16000)throw new FeedbackError('STORAGE');
 const row=JSON.parse(raw) as FeedbackJournal;
 if(!row||Object.keys(row).sort().join(',')!=='clientSubmissionId,content,email,language,requestHash,userId,version'||row.version!==1||!uuid(row.clientSubmissionId)||row.userId!==userId||typeof row.language!=='string'||row.language.length>35||typeof row.requestHash!=='string'||!/^[a-f0-9]{64}$/.test(row.requestHash))throw new FeedbackError('STORAGE');
 fields(row.content,row.email,row.userId);
 if(row.requestHash!==await hash(row.content,row.email,row.userId))throw new FeedbackError('STORAGE');return row;
}
export function parseFeedbackReceipt(value:unknown,journal:FeedbackJournal):FeedbackReceipt{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new FeedbackError('UNKNOWN');
 const row=value as FeedbackReceipt;
 if(row.received!==true||row.clientSubmissionId!==journal.clientSubmissionId||row.requestHash!==journal.requestHash||!uuid(row.inquiryId)||!['ACCEPTED','FAILED','PENDING','UNKNOWN'].includes(row.notificationStatus))throw new FeedbackError('UNKNOWN');
 return {received:true,clientSubmissionId:row.clientSubmissionId,requestHash:row.requestHash,inquiryId:row.inquiryId,notificationStatus:row.notificationStatus};
}
