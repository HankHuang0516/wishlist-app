/// <reference types="node" />
import { createHash,webcrypto } from 'node:crypto';
import { IDBFactory,IDBKeyRange } from 'fake-indexeddb';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { parsePartnerInquiry } from '../../../server/src/lib/partnerInquiry';
import { canonicalPartnerInput,partnerJournal,parsePartnerJournal,parsePartnerReceipt,readPartnerInquiry,sendPartnerInquiry,type PartnerInput } from './partnerInquiryWeb';
import { createWebPendingStore,partnerInquiryPendingKey,feedbackPendingKey,pendingRequestKey } from './webPendingStore';
const input:PartnerInput={organization:' 合成商家 ',contactName:' 合成窗口 ',contactEmail:'Fixture@Example.Invalid',websiteUrl:'https://example.com',categories:['BOOKS'],estimatedActiveItems:0,updateMethod:'MANUAL',sampleUrls:['https://example.com/item'],message:' 原內容 🦉\n不授權AI。 ',contactConsent:true,companyFax:''};
const receiptId='22222222-2222-4222-8222-222222222222';
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto as unknown as Crypto);vi.stubGlobal('IDBKeyRange',IDBKeyRange);});afterEach(()=>vi.unstubAllGlobals());
describe('exact original partner journal and server receipt',()=>{
 it('matches the actual server canonical normalization/hash while preserving original text and explicit0',async()=>{
  const {isHoneypot:_ignored,...server}=parsePartnerInquiry(input),raw=await partnerJournal(input,'zh-TW'),journal=await parsePartnerJournal(raw);
  expect(canonicalPartnerInput(input)).toEqual(server);expect(journal.requestHash).toBe(createHash('sha256').update(JSON.stringify({kind:'PARTNER',payload:server})).digest('hex'));expect(journal.input).toEqual(input);expect(journal.input.estimatedActiveItems).toBe(0);expect(raw).not.toMatch(/originalToken|currentPassword/);
 });
 it('keeps optional blank fields/null and multiple category order identical to the real server',async()=>{
  const value={...input,estimatedActiveItems:null,websiteUrl:'',message:'',sampleUrls:[],categories:['BOOKS','FURNITURE']};const {isHoneypot:_ignored,...server}=parsePartnerInquiry(value);expect(canonicalPartnerInput(value)).toEqual(server);expect((await parsePartnerJournal(await partnerJournal(value,'en-US'))).input).toEqual(value);
 });
 it('isolates public partner ciphertext from feedback, accounts and other APIs and restores after reload',async()=>{
  const factory=new IDBFactory(),name=crypto.randomUUID(),store=createWebPendingStore(name,factory,crypto),key=await partnerInquiryPendingKey('https://example.com/api'),raw=await partnerJournal(input,'en-US');await store.save(key,raw);
  expect(await createWebPendingStore(name,factory,crypto).get(key)).toBe(raw);for(const other of [await feedbackPendingKey('https://example.com/api',null),await pendingRequestKey('https://example.com/api',19,'feedback'),await partnerInquiryPendingKey('https://other.example/api')])expect(await store.get(other)).toBeNull();
  const db=await new Promise<IDBDatabase>(resolve=>{const r=factory.open(name);r.onsuccess=()=>resolve(r.result);});const entry=await new Promise<{cipher:ArrayBuffer}>(resolve=>{const r=db.transaction('pending').objectStore('pending').get(key);r.onsuccess=()=>resolve(r.result);});expect(new TextDecoder().decode(entry.cipher)).not.toMatch(/Fixture|合成商家|原內容/);db.close();
  await expect(store.save(key,await partnerJournal({...input,message:'newer'},'en-US'))).rejects.toThrow();expect(await store.clear(key,'stale')).toBe(false);expect(await store.get(key)).toBe(raw);
 });
 it('uses only original header hash for GET, verifies receipt and never submits on read',async()=>{
  const raw=await partnerJournal(input,'zh-TW'),journal=await parsePartnerJournal(raw),fetch=vi.fn(async()=>({ok:true,json:async()=>({received:true,clientSubmissionId:journal.clientSubmissionId,requestHash:journal.requestHash,inquiryId:receiptId,notificationStatus:'FAILED',error:'raw-diagnostics'})}));vi.stubGlobal('fetch',fetch);expect((await readPartnerInquiry(raw)).notificationStatus).toBe('FAILED');expect(fetch).toHaveBeenCalledTimes(1);const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];expect(url).not.toContain(journal.requestHash);expect(init.headers).toEqual({'X-Submission-Hash':journal.requestHash});expect(init.method).toBeUndefined();expect(init.cache).toBe('no-store');expect(init.redirect).toBe('error');
 });
 it('requires exact persisted evidence and live operation before sending the original body without authentication',async()=>{
  const raw=await partnerJournal(input,'zh-TW'),journal=await parsePartnerJournal(raw),store={get:vi.fn(async()=>raw),save:vi.fn(),clear:vi.fn()},fetch=vi.fn(async()=>({ok:true,json:async()=>({received:true,clientSubmissionId:journal.clientSubmissionId,requestHash:journal.requestHash,inquiryId:receiptId,notificationStatus:'PENDING'})}));vi.stubGlobal('fetch',fetch);
  await sendPartnerInquiry(raw,store,'key',()=>true);const [,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];expect(JSON.parse(String(init.body))).toEqual({clientSubmissionId:journal.clientSubmissionId,requestHash:journal.requestHash,...input});expect(init.headers).toEqual({'Content-Type':'application/json'});
  await expect(sendPartnerInquiry(raw,store,'key',()=>false)).rejects.toThrow();store.get.mockResolvedValueOnce('newer');await expect(sendPartnerInquiry(raw,store,'key',()=>true)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);
 });
 it.each([{received:false},{clientSubmissionId:receiptId},{requestHash:'a'.repeat(64)},{inquiryId:'receipt-1'},{notificationStatus:'raw-private-diagnostic'}])('rejects a wrong or malformed ACK %#',async patch=>{
  const journal=await parsePartnerJournal(await partnerJournal(input,'en-US'));expect(()=>parsePartnerReceipt({received:true,clientSubmissionId:journal.clientSubmissionId,requestHash:journal.requestHash,inquiryId:receiptId,notificationStatus:'FAILED',...patch},journal)).toThrow();
 });
 it.each([{contactConsent:false},{contactEmail:'a..b@example.invalid'},{websiteUrl:'https://127.1'},{websiteUrl:'https://private.local'},{websiteUrl:'https://u:p@example.com'},{sampleUrls:['https://example.com','https://example.com/']},{estimatedActiveItems:-1},{estimatedActiveItems:1.5},{estimatedActiveItems:1000001},{categories:['BOOKS','BOOKS']},{message:'a\u0000b'}])('fails before persistence/HTTP for invalid input %#',async patch=>{await expect(partnerJournal({...input,...patch},'en-US')).rejects.toThrow();});
 it('rejects a changed saved payload/hash/identity or unknown field before any read or send',async()=>{
  const journal=await parsePartnerJournal(await partnerJournal(input,'en-US')),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  for(const patch of [{input:{...input,message:'changed'}},{requestHash:'a'.repeat(64)},{clientSubmissionId:'bad'},{extra:'private'}])await expect(readPartnerInquiry(JSON.stringify({...journal,...patch}))).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
 });
});
