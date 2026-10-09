import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { publicUrl, ref } from './sourceLeadPrimitives';
import { archiveGate } from './sourceLeadDateGate';
import { forbiddenListingField, privateContactField } from './listingPolicy';
import { TAIWAN_DISTRICTS } from './taiwanAdministrativeDistricts';

export class ImportError extends Error {}
export const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const LIMIT = 10000;
const MAX_BYTES = 16 * 1024 * 1024;
export type Base = { libraryFileId: string; jsonVersion: number; sha256: string; csvLibraryFileId: string; csvVersion: number; csvSha256: string };
export type PendingItem = { id: string; sourceUrl: string; itemKey: string; title: string; price: number | null; currency: string | null;
    county: string | null; district: string | null; originalPostedAt: string | null; checkedAt: string | null;
    sourceStatus: string; rights: 'UNKNOWN' | 'CLAIMED_WITH_REFERENCE'; rightsRef: string | null;
    issues: string[]; state: 'PENDING_REVIEW'; public: false; contentHash: string };
const keys = ['sourceUrl','itemKey','title','price','currency','county','district','originalPostedAt','checkedAt','status','rightsRef'];
const aliases: Record<string,string> = { 原帖網址:'sourceUrl', 原始ID:'itemKey', 商品名稱:'title', 名稱:'title', 價格:'price', 幣別:'currency', 縣市:'county', 行政區:'district', 原發日期:'originalPostedAt', 來源查核時間:'checkedAt', 狀態:'status', 授權證據:'rightsRef' };
const clean = (v: unknown, max: number) => { if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string' || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) throw new ImportError('INVALID_FIELD'); return v.trim() || null; };
const iso = (v: unknown) => { const s=clean(v,40); if (!s) return null;
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(s) || !Number.isFinite(Date.parse(s))) throw new ImportError('INVALID_DATE');
    const datePart=s.slice(0,10), d=new Date(datePart+'T00:00:00Z'); if(d.toISOString().slice(0,10)!==datePart)throw new ImportError('INVALID_DATE');
    return new Date(s).toISOString(); };
export function validateBase(b: Base) { if(!b || Object.keys(b).sort().join(',') !== 'csvLibraryFileId,csvSha256,csvVersion,jsonVersion,libraryFileId,sha256' || ![b.libraryFileId,b.csvLibraryFileId].every(v=>/^libfile_[a-f0-9]{32}$/.test(v)) || ![b.jsonVersion,b.csvVersion].every(v=>Number.isSafeInteger(v)&&v>=0) || ![b.sha256,b.csvSha256].every(v=>/^[a-f0-9]{64}$/.test(v)))throw new ImportError('BASE_REQUIRED'); }
const sameBase=(a:Base,b:Base)=>a.libraryFileId===b.libraryFileId&&a.jsonVersion===b.jsonVersion&&a.csvVersion===b.csvVersion&&a.sha256===b.sha256&&a.csvLibraryFileId===b.csvLibraryFileId&&a.csvSha256===b.csvSha256;

// RFC4180 subset: quoted commas/newlines and escaped quotes; bounded, no network.
export function parseCsv(text: string): Record<string,unknown>[] {
    const rows: string[][]=[]; let row:string[]=[],field='',quoted=false,closed=false;
    text=text.replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++) { const c=text[i];
        if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
        else if(c==='"'){if(field||closed)throw new ImportError('INVALID_CSV');quoted=true;}
        else if(c===','||c==='\n'||c==='\r'){row.push(field);field='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;rows.push(row);row=[];if(rows.length>LIMIT+1)throw new ImportError('ROW_LIMIT');}}
        else {if(closed)throw new ImportError('INVALID_CSV');field+=c;}
    }
    if(quoted)throw new ImportError('INVALID_CSV');if(field||row.length||closed){row.push(field);rows.push(row);}
    const header=rows.shift();if(!header?.length)throw new ImportError('EMPTY_INPUT');
    const mapped=header.map(h=>aliases[h.trim()]??h.trim());
    if(new Set(mapped).size!==mapped.length||mapped.some(k=>!keys.includes(k)))throw new ImportError('INVALID_HEADERS');
    return rows.filter(r=>r.some(v=>v!=='')).map(r=>{if(r.length!==mapped.length)throw new ImportError('CSV_WIDTH');return Object.fromEntries(mapped.map((k,i)=>[k,r[i]]));});
}
export function parseInput(text: string, format: 'csv'|'json') {
    if(typeof text!=='string'||Buffer.byteLength(text)>MAX_BYTES)throw new ImportError('INPUT_TOO_LARGE');
    let rows: unknown[];
    if(format==='csv')rows=parseCsv(text);
    else if(format==='json'){const data=JSON.parse(text);rows=Array.isArray(data)?data:data?.items;if(!Array.isArray(rows))throw new ImportError('ITEM_ARRAY_REQUIRED');}
    else throw new ImportError('INVALID_FORMAT');
    if(!rows.length||rows.length>LIMIT)throw new ImportError('ROW_LIMIT');
    const flat:unknown[]=[];for(const row of rows){if(row&&typeof row==='object'&&!Array.isArray(row)&&Array.isArray((row as any).items)){const {items,...post}=row as any;if(Object.keys(post).some(k=>!['sourceUrl','originalPostedAt','checkedAt'].includes(aliases[k]??k))||!items.length)throw new ImportError('INVALID_POST');for(const item of items){if(!item||typeof item!=='object'||Array.isArray(item))throw new ImportError('INVALID_ROW');flat.push({...post,...item});if(flat.length>LIMIT)throw new ImportError('ROW_LIMIT');}}else flat.push(row);}if(flat.length>LIMIT)throw new ImportError('ROW_LIMIT');return flat;
}
export function normalize(input: unknown, now: Date): PendingItem {
    if(!input||typeof input!=='object'||Array.isArray(input))throw new ImportError('INVALID_ROW');
    const b:Record<string,unknown>={};for(const [k,v] of Object.entries(input)){const key=aliases[k]??k;if(!keys.includes(key)||Object.hasOwnProperty.call(b,key))throw new ImportError('UNEXPECTED_FIELD');b[key]=v;}
    const sourceUrl=publicUrl(b.sourceUrl),title=clean(b.title,100);if(!title||forbiddenListingField({title})||privateContactField({title}))throw new ImportError('SAFE_TITLE_REQUIRED');
    const issues:string[]=[],itemKey=clean(b.itemKey,160)??('unresolved-'+sha(title).slice(0,20));if(!b.itemKey)issues.push('STABLE_ITEM_KEY_REQUIRED');
    const price=b.price===undefined||b.price===null||b.price===''?null:Number(b.price);
    if(typeof b.price==='string'&&b.price!==''&&!/^\d+(?:\.\d{1,2})?$/.test(b.price))throw new ImportError('INVALID_PRICE');
    if(price!==null&&(!['number','string'].includes(typeof b.price)||!Number.isFinite(price)||price<0||price>20000000))throw new ImportError('INVALID_PRICE');
    const currency=clean(b.currency,3);if(currency&&!['TWD','USD','JPY','EUR','HKD','CNY'].includes(currency))throw new ImportError('INVALID_CURRENCY');if(price===null)issues.push('PRICE_UNKNOWN');if(!currency)issues.push('CURRENCY_UNKNOWN');
    const county=clean(b.county,20)?.replace(/^台/,'臺')??null,district=clean(b.district,20);
    if(county&&!TAIWAN_DISTRICTS[county])throw new ImportError('INVALID_COUNTY');if(district&&(!county||!TAIWAN_DISTRICTS[county]?.has(district)))throw new ImportError('INVALID_DISTRICT');if(!county||!district)issues.push('LOCATION_UNKNOWN');
    const originalPostedAt=iso(b.originalPostedAt),checkedAt=iso(b.checkedAt);
    if(!originalPostedAt)issues.push('ORIGINAL_DATE_UNKNOWN');
    else if(!archiveGate({originalPostedAt:new Date(originalPostedAt),verifiedAddress:'date-only',addressEvidenceRef:'date-only',verifiedLatitude:23,verifiedLongitude:120},now))issues.push(new Date(originalPostedAt)>now?'FUTURE_ORIGINAL_DATE':'OUTSIDE_TWO_CALENDAR_MONTHS');
    if(!checkedAt)issues.push('SOURCE_CHECK_UNKNOWN');else if(new Date(checkedAt)>now)issues.push('FUTURE_SOURCE_CHECK');else if(now.getTime()-Date.parse(checkedAt)>48*3600000)issues.push('SOURCE_CHECK_STALE');
    const sourceStatus=clean(b.status,20)?.toUpperCase()??'UNKNOWN';if(!['ACTIVE','RESERVED','SOLD','WITHDRAWN','UNKNOWN'].includes(sourceStatus))throw new ImportError('INVALID_STATUS');
    // An ACTIVE assertion is not a verified live-stock observation.
    issues.push('STOCK_UNVERIFIED');if(['SOLD','WITHDRAWN'].includes(sourceStatus))issues.push('NOT_AVAILABLE');
    const rightsRef=clean(b.rightsRef,190);if(rightsRef&&!ref(rightsRef))throw new ImportError('INVALID_RIGHTS_REFERENCE');issues.push(rightsRef?'RIGHTS_NEED_REVIEW':'RIGHTS_UNKNOWN');
    const facts={sourceUrl,itemKey,title,price,currency,county,district,originalPostedAt,checkedAt,sourceStatus,rights: rightsRef?'CLAIMED_WITH_REFERENCE' as const:'UNKNOWN' as const,rightsRef};
    return {...facts,id:'pending-'+sha(sourceUrl+'\0'+itemKey),contentHash:sha(JSON.stringify(facts)),issues,state:'PENDING_REVIEW',public:false};
}
export type Job = { schemaVersion:1; id:string; revision:number; base:Base; inputSha256:string; evaluationAt:string; total:number; cursor:number; state:'PROCESSING'|'COMPLETE'|'CANCELLED'; chunks:string[]; accepted:number; rejected:number; duplicates:number };
export class PendingImportStore {
    // At most one bounded 10k-item job per process. Revision/stat changes force a
    // reload; durable checkpoints, not these caches, are the recovery authority.
    private inputCache?:{id:string;signature:string;rows:unknown[]};
    private indexCache?:{id:string;revision:number;facts:Map<string,PendingItem>};
    constructor(readonly root:string) {}
    private safeRoot(){const p=path.resolve(this.root),s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||fs.realpathSync(p)!==p||(s.mode&0o777)!==0o700||s.uid!==(process.getuid?.() ?? -1))throw new ImportError('PRIVATE_STORE_REQUIRED');return p;}
    private jobDir(id:string){if(!/^[a-f0-9]{64}$/.test(id))throw new ImportError('INVALID_JOB');return path.join(this.safeRoot(),id);}
    private atomic(file:string,value:unknown){const tmp=file+'.'+randomUUID()+'.tmp',fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
    private read<T>(file:string):T {const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o777)!==0o600||s.uid!==(process.getuid?.() ?? -1))throw new ImportError('PRIVATE_FILE_REQUIRED');return JSON.parse(fs.readFileSync(file,'utf8'));}
    private lock<T>(fn:()=>T):T {const file=path.join(this.safeRoot(),'writer.lock');if(fs.existsSync(path.join(this.safeRoot(),'recovery.lock')))throw new ImportError('WRITER_BUSY');let fd:number;try{fd=fs.openSync(file,'wx',0o600);}catch{throw new ImportError('WRITER_BUSY');}try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,host:os.hostname(),nonce:randomUUID(),at:new Date().toISOString()}));fs.fsyncSync(fd);return fn();}finally{fs.closeSync(fd);fs.unlinkSync(file);}}
    lockStatus(){const file=path.join(this.safeRoot(),'writer.lock');if(!fs.existsSync(file))return null;const bytes=fs.readFileSync(file,'utf8');return {sha256:sha(bytes),lock:this.read<any>(file)};}
    // Explicit recovery only on the SAME host after the exact observed owner PID
    // is proven absent. Never steal live/cross-host/unknown locks or auto retry writes.
    recoverLock(expectedHash:string){const root=this.safeRoot(),barrier=path.join(root,'recovery.lock');let fd:number;try{fd=fs.openSync(barrier,'wx',0o600);}catch{throw new ImportError('WRITER_BUSY');}try{const status=this.lockStatus();if(!status||status.sha256!==expectedHash||status.lock.host!==os.hostname()||!Number.isSafeInteger(status.lock.pid)||status.lock.pid<=0)throw new ImportError('LOCK_RECOVERY_DENIED');let dead=false;try{process.kill(status.lock.pid,0);}catch(e){dead=(e as NodeJS.ErrnoException).code==='ESRCH';}if(!dead)throw new ImportError('LOCK_OWNER_NOT_PROVEN_DEAD');fs.unlinkSync(path.join(root,'writer.lock'));return {recovered:true,canonicalWrites:0};}finally{fs.closeSync(fd);fs.unlinkSync(barrier);}}
    get(id:string):Job {const dir=this.jobDir(id);const s=fs.lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o777)!==0o700)throw new ImportError('PRIVATE_JOB_REQUIRED');return this.read(path.join(dir,'job.json'));}
    create(text:string,format:'csv'|'json',base:Base,now=new Date()):Job {validateBase(base);const rows=parseInput(text,format),inputSha256=sha(text),id=sha(JSON.stringify({inputSha256,format,base:[base.libraryFileId,base.jsonVersion,base.sha256,base.csvLibraryFileId,base.csvVersion,base.csvSha256]}));return this.lock(()=>{
        const dir=this.jobDir(id);if(fs.existsSync(path.join(dir,'job.json')))return this.get(id);if(!fs.existsSync(dir))fs.mkdirSync(dir,{mode:0o700});else{const s=fs.lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o777)!==0o700)throw new ImportError('PRIVATE_JOB_REQUIRED');}
        if(fs.existsSync(path.join(dir,'input.json'))){if(JSON.stringify(this.read(path.join(dir,'input.json')))!==JSON.stringify(rows))throw new ImportError('INPUT_RECOVERY_CONFLICT');}else this.atomic(path.join(dir,'input.json'),rows);
        const job:Job={schemaVersion:1,id,revision:0,base,inputSha256,evaluationAt:now.toISOString(),total:rows.length,cursor:0,state:'PROCESSING',chunks:[],accepted:0,rejected:0,duplicates:0};this.atomic(path.join(dir,'job.json'),job);return job;
    });}
    private chunks(job:Job):any[]{return job.chunks.flatMap(name=>this.read<any[]>(path.join(this.jobDir(job.id),name)));}
    private input(job:Job){const file=path.join(this.jobDir(job.id),'input.json'),s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o777)!==0o600||s.uid!==(process.getuid?.()??-1))throw new ImportError('PRIVATE_FILE_REQUIRED');const signature=[s.ino,s.size,s.mtimeMs,s.ctimeMs].join(':');if(this.inputCache?.id===job.id&&this.inputCache.signature===signature)return this.inputCache.rows;const rows=this.read<unknown[]>(file);this.inputCache={id:job.id,signature,rows};return rows;}
    page(id:string,cursor=0,limit=100){const job=this.get(id);if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isSafeInteger(limit)||limit<1||limit>500)throw new ImportError('INVALID_PAGE');const rows=this.chunks(job);return {job,items:rows.slice(cursor,cursor+limit),nextCursor:cursor+limit<rows.length?cursor+limit:null};}
    advance(id:string,expectedRevision:number,currentBase:Base,batchSize=500):Job {validateBase(currentBase);if(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>500)throw new ImportError('INVALID_BATCH');return this.lock(()=>{
        const job=this.get(id);if(job.revision!==expectedRevision)throw new ImportError('REVISION_CONFLICT');if(!sameBase(currentBase,job.base))throw new ImportError('BASE_VERSION_CONFLICT');if(job.state!=='PROCESSING')return job;
        const facts=this.indexCache?.id===id&&this.indexCache.revision===job.revision?new Map(this.indexCache.facts):new Map<string,PendingItem>(this.chunks(job).filter(r=>r.item).map(r=>[r.item.id,r.item]));
        const seen=new Map<string,string>(Array.from(facts,([id,item])=>[id,item.contentHash]));
        const input=this.input(job),end=Math.min(job.cursor+batchSize,job.total),chunk:any[]=[];
        for(let i=job.cursor;i<end;i++)try{const item=normalize(input[i],new Date(job.evaluationAt)),old=seen.get(item.id);if(old){job.duplicates++;const previous=facts.get(item.id);chunk.push({row:i,outcome:old===item.contentHash?'DUPLICATE':'CONFLICT',id:item.id,...(old!==item.contentHash?{proposed:item,previousContentHash:old,changedFields:previous?Object.keys(item).filter(k=>!['issues','contentHash'].includes(k)&&JSON.stringify((item as any)[k])!==JSON.stringify((previous as any)[k])):[]}: {})});if(old!==item.contentHash)job.rejected++;}else{seen.set(item.id,item.contentHash);facts.set(item.id,item);job.accepted++;chunk.push({row:i,outcome:'PENDING_REVIEW',item});}}catch(e){job.rejected++;chunk.push({row:i,outcome:'INVALID',errorCode:e instanceof Error?e.message:'INVALID_ROW'});}
        const name='chunk-'+job.cursor+'.json';this.atomic(path.join(this.jobDir(id),name),chunk);job.chunks.push(name);job.cursor=end;job.revision++;if(end===job.total)job.state='COMPLETE';this.atomic(path.join(this.jobDir(id),'job.json'),job);this.indexCache={id,revision:job.revision,facts};return job;
    });}
    cancel(id:string,revision:number):Job {return this.lock(()=>{const job=this.get(id);if(job.revision!==revision)throw new ImportError('REVISION_CONFLICT');if(job.state==='COMPLETE')throw new ImportError('ALREADY_COMPLETE');job.state='CANCELLED';job.revision++;this.atomic(path.join(this.jobDir(id),'job.json'),job);return job;});}
    review(id:string,revision:number,currentBase:Base,decisions:{id:string;contentHash:string;reviewRef:string;action:'KEEP_PENDING'|'REJECT'}[]):Job {return this.lock(()=>{const job=this.get(id);validateBase(currentBase);if(job.revision!==revision||!sameBase(job.base,currentBase))throw new ImportError('REVIEW_VERSION_CONFLICT');if(job.state!=='COMPLETE'||!Array.isArray(decisions)||!decisions.length||decisions.length>500)throw new ImportError('COMPLETED_REVIEW_REQUIRED');const items=new Map<string,PendingItem>(this.chunks(job).filter(r=>r.item).map(r=>[r.item.id,r.item]));
        if(new Set(decisions.map(d=>d.id)).size!==decisions.length)throw new ImportError('DUPLICATE_REVIEW');
        for(const d of decisions)if(!d||Object.keys(d).sort().join(',')!=='action,contentHash,id,reviewRef'||!['KEEP_PENDING','REJECT'].includes(d.action)||!ref(d.reviewRef)||items.get(d.id)?.contentHash!==d.contentHash)throw new ImportError('BOUND_REVIEW_REQUIRED');
        const file=path.join(this.jobDir(id),'review-'+(revision+1)+'.json');this.atomic(file,{jobId:id,base:job.base,reviewedAt:new Date().toISOString(),decisions,publicationAllowed:false});job.revision++;this.atomic(path.join(this.jobDir(id),'job.json'),job);return job;
    });}
    export(id:string,revision:number,currentBase:Base){return this.lock(()=>{const job=this.get(id);validateBase(currentBase);if(job.revision!==revision||!sameBase(job.base,currentBase))throw new ImportError('EXPORT_VERSION_CONFLICT');if(job.state!=='COMPLETE')throw new ImportError('INCOMPLETE_JOB');
        const rows=this.chunks(job),reviews:any[]=[],reviewById=new Map<string,any>();for(let n=1;n<=revision;n++){const file=path.join(this.jobDir(id),'review-'+n+'.json');if(fs.existsSync(file)){const record=this.read<any>(file);reviews.push(record);for(const decision of record.decisions)reviewById.set(decision.id,decision);}}
        const items=rows.filter(r=>r.item).map(r=>({...r.item,reviewAction:reviewById.get(r.item.id)?.action??'UNREVIEWED',reviewRef:reviewById.get(r.item.id)?.reviewRef??null})),json=JSON.stringify({schemaVersion:1,jobId:id,base:job.base,evaluationAt:job.evaluationAt,items,results:rows.filter(r=>!r.item),reviews,requiresHumanReview:true,qualifiedSupplyAdded:0});
        const header=['id',...keys,'issues','state','public','reviewAction','reviewRef'];const cell=(v:unknown)=>{let s=Array.isArray(v)?v.join('|'):v===null||v===undefined?'':String(v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
        const csv=[header.map(cell).join(','),...items.map((r:PendingItem)=>header.map(k=>cell(k==='status'?r.sourceStatus:(r as any)[k])).join(','))].join('\r\n')+'\r\n';
        const dir=path.join(this.jobDir(id),'export-'+revision);if(!fs.existsSync(dir))fs.mkdirSync(dir,{mode:0o700});const dirStat=fs.lstatSync(dir);if(!dirStat.isDirectory()||dirStat.isSymbolicLink()||(dirStat.mode&0o777)!==0o700)throw new ImportError('PRIVATE_EXPORT_REQUIRED');
        for(const [name,bytes] of [['pending.json',json],['pending.csv',csv]]){const file=path.join(dir,name);if(fs.existsSync(file)){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o777)!==0o600||s.uid!==(process.getuid?.()??-1)||fs.readFileSync(file,'utf8')!==bytes)throw new ImportError('EXPORT_RECOVERY_CONFLICT');}else{const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}}
        if(!fs.existsSync(path.join(dir,'manifest.json')))this.atomic(path.join(dir,'manifest.json'),{jobId:id,revision,base:job.base,count:items.length,jsonSha256:sha(json),csvSha256:sha(csv),canonicalWrite:false});
        const manifest=this.read<any>(path.join(dir,'manifest.json'));if(manifest.jsonSha256!==sha(fs.readFileSync(path.join(dir,'pending.json'),'utf8'))||manifest.csvSha256!==sha(fs.readFileSync(path.join(dir,'pending.csv'),'utf8')))throw new ImportError('EXPORT_HASH_MISMATCH');return {manifest,json,csv};
    });}
}
