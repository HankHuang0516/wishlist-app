import { createHash, webcrypto } from 'node:crypto';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { feedbackJournal,parseFeedbackJournal,parseFeedbackReceipt,readFeedback,sendFeedback } from './feedbackWeb';
beforeEach(()=>vi.stubGlobal('crypto',webcrypto));afterEach(()=>vi.unstubAllGlobals());
describe('feedback operation identity and transport',()=>{
 it.each(['a..b@example.invalid','.a@example.invalid','a@example..invalid','a@-example.invalid','name <a@example.invalid>','a@example.invalid\r\nBcc:x@y.z'])('rejects an invalid reply mailbox before saving a journal %s',async email=>{
  await expect(feedbackJournal('original',email,null,'en-US')).rejects.toThrow('INPUT');
 });
 it.each([null,42])('binds server canonical content and owner %s while preserving raw draft text',async userId=>{
  const raw=await feedbackJournal('  合成 🦉 {id}  ','Fixture@Example.invalid',userId,'zh-TW'),journal=await parseFeedbackJournal(raw,userId);
  expect(journal.requestHash).toBe(createHash('sha256').update(JSON.stringify({kind:'FEEDBACK',payload:{content:'合成 🦉 {id}',userId,contactEmail:userId===null?'fixture@example.invalid':null}})).digest('hex'));expect(journal.content).toBe('  合成 🦉 {id}  ');expect(raw).not.toContain('Bearer');
 });
 it.each([{content:'replacement'},{userId:43},{requestHash:'a'.repeat(64)},{clientSubmissionId:'wrong'},{extra:'raw'},{version:2}])('rejects tampered stored evidence %#',async patch=>{
  const raw=await feedbackJournal('original','fixture@example.invalid',42,'en-US');await expect(parseFeedbackJournal(JSON.stringify({...JSON.parse(raw),...patch}),42)).rejects.toThrow();
 });
 it('projects only verified receipt fields and never carries raw provider replies into view state',async()=>{
  const journal=await parseFeedbackJournal(await feedbackJournal('original','fixture@example.invalid',null,'en-US'),null);
  const valid={received:true,clientSubmissionId:journal.clientSubmissionId,requestHash:journal.requestHash,inquiryId:'11111111-1111-4111-8111-111111111111',notificationStatus:'PENDING',message:'raw-provider-secret'};
  expect(parseFeedbackReceipt(valid,journal)).not.toHaveProperty('message');
 });
 it('requires matching original storage and active scope before any mutation',async()=>{
  const raw=await feedbackJournal('original','',42,'en-US'),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  const store={get:vi.fn().mockResolvedValue('other'),save:vi.fn(),clear:vi.fn()};
  await expect(sendFeedback(raw,42,'synthetic',store,'key',()=>true)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
  store.get.mockResolvedValue(raw);await expect(sendFeedback(raw,42,'synthetic',store,'key',()=>false)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
  await expect(sendFeedback(raw,42,null,store,'key',()=>true)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
 });
 it('read-only restoration requires live owner credentials and never POSTs automatically',async()=>{
  const raw=await feedbackJournal('original','',42,'en-US'),fetch=vi.fn().mockResolvedValue(new Response('{}',{status:404}));vi.stubGlobal('fetch',fetch);
  await expect(readFeedback(raw,42,null)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();await expect(readFeedback(raw,42,'synthetic')).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][1]).toMatchObject({cache:'no-store',redirect:'error',headers:{Authorization:'Bearer synthetic'}});expect(fetch.mock.calls[0][1].method).toBeUndefined();
 });
});
