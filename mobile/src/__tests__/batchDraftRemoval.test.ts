import {createHash,randomUUID} from 'node:crypto';
import {it,expect,vi} from 'vitest';
vi.mock('expo-crypto',()=>({CryptoDigestAlgorithm:{SHA256:'SHA256'},digestStringAsync:async(_:string,v:string)=>createHash('sha256').update(v).digest('hex'),randomUUID:()=>randomUUID()}));
import {batchRemovalJournal,parseBatchRemoval,batchRemovalResult,readBatchRemoval,sendBatchRemoval} from '../batchDraftRemoval';
import type {createApi} from '../api';
const mediaId=randomUUID(),captureKey=randomUUID();
async function fixture(){const raw=await batchRemovalJournal(mediaId,18,randomUUID(),captureKey),op=await parseBatchRemoval(raw);return {raw,op,value:{receipt:{clientActionId:op.clientActionId,requestHash:op.requestHash,state:'REMOVED',mediaId,expectedVersion:18,createdAt:new Date().toISOString()},media:null,cleanupPending:true}};}
it('binds the exact server hash to the saved revision and original local capture',async()=>{const {op}=await fixture();expect(op.captureKey).toBe(captureKey);expect(op.requestHash).toBe(createHash('sha256').update(JSON.stringify({purpose:'BATCH_ITEM_REMOVAL',mediaId,expectedVersion:18})).digest('hex'));});
it('saves before sending, recovers a lost acknowledgement by GET only, and reuses the exact action',async()=>{
 const {raw,op,value}=await fixture(),order:string[]=[];let posts=0;
 const api=vi.fn(async(_p:string,options?:RequestInit)=>{order.push(options?.method??'GET');if(options?.method==='POST'&&posts++===0)throw Error('Lost ACK');return value;}) as unknown as ReturnType<typeof createApi>;
 await expect(sendBatchRemoval(api,raw,19,async()=>{order.push('SAVED');},()=>true)).rejects.toThrow('Lost ACK');
 expect(await readBatchRemoval(api,raw,19)).toEqual({state:'REMOVED',cleanupPending:true});expect(order).toEqual(['SAVED','POST','GET']);expect(api).toHaveBeenLastCalledWith('/listing-media/photo-removals/'+op.clientActionId);
});
it('never sends after a failed durable save or an account switch',async()=>{const {raw}=await fixture(),api=vi.fn();await expect(sendBatchRemoval(api,raw,19,async()=>{throw Error('Storage');},()=>true)).rejects.toThrow('Storage');await expect(sendBatchRemoval(api,raw,19,async()=>{},()=>false)).rejects.toThrow();expect(api).not.toHaveBeenCalled();});
it.each(['clientActionId','requestHash','expectedVersion','mediaId'])('rejects a mismatched %s receipt without treating the draft as removed',async field=>{const {raw,value}=await fixture();await expect(batchRemovalResult({...value,receipt:{...value.receipt,[field]:field==='expectedVersion'?17:randomUUID()}},raw,19)).rejects.toThrow();});
it('preserves a newer/other owner draft and rejects a forged removed outcome',async()=>{
 const {raw,value}=await fixture();const media={id:mediaId,ownerUserId:20,listingId:null,wishItemId:null,capturePurpose:'BATCH_ITEM',sellerDraft:null,sellerDraftVersion:19};
 await expect(batchRemovalResult({...value,receipt:{...value.receipt,state:'CONFLICT'},media,cleanupPending:false},raw,19)).rejects.toThrow('Foreign draft');
 await expect(batchRemovalResult({...value,media:{...media,ownerUserId:19}},raw,19)).rejects.toThrow();
 expect(await batchRemovalResult({...value,receipt:{...value.receipt,state:'CONFLICT'},media:{...media,ownerUserId:19},cleanupPending:false},raw,19)).toEqual({state:'CONFLICT',cleanupPending:false});
});
it('rejects corrupt persisted identity and never calls the API',async()=>{const {raw}=await fixture(),api=vi.fn();await expect(readBatchRemoval(api,raw.replace('"expectedVersion":18','"expectedVersion":19'),19)).rejects.toThrow();expect(api).not.toHaveBeenCalled();});
