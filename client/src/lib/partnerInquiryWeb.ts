import { API_URL } from '../config';
import { sha256,type PendingStore } from './webPendingStore';
export class PartnerInquiryError extends Error {}
export const partnerCategories=['FURNITURE','BOOKS','ELECTRONICS','CAMERA','MUSIC','TOYS','FASHION','OTHER'] as const;
export const partnerUpdateMethods=['MANUAL','CSV','API','OTHER'] as const;
export type PartnerInput={organization:string;contactName:string;contactEmail:string;websiteUrl:string;categories:string[];estimatedActiveItems:number|null;updateMethod:string;sampleUrls:string[];message:string;contactConsent:boolean;companyFax:string};
export type PartnerJournal={version:1;clientSubmissionId:string;input:PartnerInput;language:string;requestHash:string};
export type PartnerReceipt={received:true;clientSubmissionId:string;requestHash:string;inquiryId:string;notificationStatus:'PENDING'|'UNKNOWN'|'ACCEPTED'|'FAILED'};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function text(value:unknown,min:number,max:number,multiline=false){
 if(typeof value!=='string')throw new PartnerInquiryError('INPUT');const trimmed=value.trim();
 if(trimmed.length<min||trimmed.length>max||(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u:/[\u0000-\u001f\u007f]/u).test(trimmed))throw new PartnerInquiryError('INPUT');return trimmed;
}
function https(value:unknown){
 const original=text(value,1,500);try{const url=new URL(original),host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||/^(?:\d+\.){3}\d+$/.test(host)||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||!host.includes('.')||/[^a-z0-9.-]/u.test(host))throw Error('INPUT');return url.toString();
 }catch{throw new PartnerInquiryError('INPUT');}
}
function mailbox(value:string){const parts=value.split('@');if(parts.length!==2||/[\u0000-\u0020\u007f]/u.test(value))return false;const [local,domain]=parts;
 return local.length>0&&local.length<=64&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)&&!local.startsWith('.')&&!local.endsWith('.')&&!local.includes('..')&&domain.length<=253&&domain.includes('.')&&domain.split('.').every(label=>/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}
/** Match the established server normalization and property order exactly. */
export function canonicalPartnerInput(input:PartnerInput){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='categories,companyFax,contactConsent,contactEmail,contactName,estimatedActiveItems,message,organization,sampleUrls,updateMethod,websiteUrl'||input.contactConsent!==true||typeof input.companyFax!=='string')throw new PartnerInquiryError('INPUT');
 const email=text(input.contactEmail,5,254).toLowerCase();if(!mailbox(email))throw new PartnerInquiryError('INPUT');
 if(!Array.isArray(input.categories)||input.categories.length<1||input.categories.length>8||new Set(input.categories).size!==input.categories.length||input.categories.some(value=>!partnerCategories.includes(value as typeof partnerCategories[number]))||!partnerUpdateMethods.includes(input.updateMethod as typeof partnerUpdateMethods[number])||input.estimatedActiveItems!==null&&(!Number.isInteger(input.estimatedActiveItems)||input.estimatedActiveItems<0||input.estimatedActiveItems>1000000)||!Array.isArray(input.sampleUrls)||input.sampleUrls.length>3||typeof input.websiteUrl!=='string'||typeof input.message!=='string')throw new PartnerInquiryError('INPUT');
 const samples=input.sampleUrls.map(https);if(new Set(samples).size!==samples.length)throw new PartnerInquiryError('INPUT');
 return {organization:text(input.organization,2,120),contactName:text(input.contactName,2,80),contactEmail:email,websiteUrl:input.websiteUrl?https(input.websiteUrl):null,categories:input.categories,estimatedActiveItems:input.estimatedActiveItems,updateMethod:input.updateMethod,sampleUrls:samples,message:input.message?text(input.message,1,1000,true):null};
}
const hash=(input:PartnerInput)=>sha256(JSON.stringify({kind:'PARTNER',payload:canonicalPartnerInput(input)}));
export async function partnerJournal(input:PartnerInput,language:string){
 if(typeof language!=='string'||language.length>35)throw new PartnerInquiryError('INPUT');
 return JSON.stringify({version:1,clientSubmissionId:crypto.randomUUID(),input,language,requestHash:await hash(input)});
}
export async function parsePartnerJournal(raw:string):Promise<PartnerJournal>{
 if(typeof raw!=='string'||raw.length>16000)throw new PartnerInquiryError('STORAGE');
 const row=JSON.parse(raw) as PartnerJournal;
 if(!row||Object.keys(row).sort().join(',')!=='clientSubmissionId,input,language,requestHash,version'||row.version!==1||!uuid(row.clientSubmissionId)||typeof row.language!=='string'||row.language.length>35||typeof row.requestHash!=='string'||!/^[a-f0-9]{64}$/.test(row.requestHash)||row.requestHash!==await hash(row.input))throw new PartnerInquiryError('STORAGE');return row;
}
export function parsePartnerReceipt(value:unknown,journal:PartnerJournal):PartnerReceipt{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new PartnerInquiryError('UNKNOWN');const row=value as PartnerReceipt;
 if(row.received!==true||row.clientSubmissionId!==journal.clientSubmissionId||row.requestHash!==journal.requestHash||!uuid(row.inquiryId)||!['PENDING','UNKNOWN','ACCEPTED','FAILED'].includes(row.notificationStatus))throw new PartnerInquiryError('UNKNOWN');
 return {received:true,clientSubmissionId:row.clientSubmissionId,requestHash:row.requestHash,inquiryId:row.inquiryId,notificationStatus:row.notificationStatus};
}
export async function readPartnerInquiry(raw:string){
 const journal=await parsePartnerJournal(raw);const response=await fetch(`${API_URL}/partner-inquiries/submissions/${journal.clientSubmissionId}`,{headers:{'X-Submission-Hash':journal.requestHash},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new PartnerInquiryError('UNKNOWN');return parsePartnerReceipt(await response.json(),journal);
}
export async function sendPartnerInquiry(raw:string,store:PendingStore,key:string,active:()=>boolean){
 const journal=await parsePartnerJournal(raw);if(!active()||await store.get(key)!==raw||!active())throw new PartnerInquiryError('STORAGE');
 const response=await fetch(`${API_URL}/partner-inquiries`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientSubmissionId:journal.clientSubmissionId,requestHash:journal.requestHash,...journal.input}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new PartnerInquiryError('UNKNOWN');return parsePartnerReceipt(await response.json(),journal);
}
