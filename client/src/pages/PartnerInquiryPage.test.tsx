/// <reference types="node" />
import { webcrypto } from 'node:crypto';
import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import PartnerInquiryPage from './PartnerInquiryPage';
import { partnerJournal,type PartnerInput } from '../lib/partnerInquiryWeb';
import { partnerInquiryPendingKey } from '../lib/webPendingStore';
import { API_URL } from '../config';
const {store,bodies}=vi.hoisted(()=>({store:{get:vi.fn(),save:vi.fn(),clear:vi.fn()},bodies:new Map<string,string>()}));
vi.mock('../lib/webPendingStore',async original=>({...await original<typeof import('../lib/webPendingStore')>(),privatePendingStore:store}));
const receiptId='22222222-2222-4222-8222-222222222222',original=()=>[...bodies.values()][0]??null;
const input:PartnerInput={organization:'原商家',contactName:'原窗口',contactEmail:'fixture@example.invalid',websiteUrl:'',categories:['FURNITURE'],estimatedActiveItems:0,updateMethod:'MANUAL',sampleUrls:[],message:'原內容 🦉',contactConsent:true,companyFax:''};
const ack=(data:Record<string,unknown>,status='FAILED')=>({received:true,clientSubmissionId:data.clientSubmissionId,requestHash:data.requestHash,inquiryId:receiptId,notificationStatus:status});
const ok=(value:unknown)=>({ok:true,status:201,json:async()=>value});
const submit=()=>fireEvent.submit(screen.getByRole('button',{name:'送出合作意向'}).closest('form')!);
async function mount(){const view=render(<PartnerInquiryPage/>);await waitFor(()=>expect(screen.getByRole('button',{name:'送出合作意向'})).toBeEnabled());return view;}
function fill(){fireEvent.change(screen.getByLabelText('商家／來源名稱'),{target:{value:'測試商家'}});fireEvent.change(screen.getByLabelText('聯絡人'),{target:{value:'測試窗口'}});fireEvent.change(screen.getByLabelText('回覆 Email'),{target:{value:'fixture@example.invalid'}});fireEvent.click(screen.getByRole('checkbox'));}
async function seed(value=input){const raw=await partnerJournal(value,'zh-TW');bodies.set(await partnerInquiryPendingKey(API_URL),raw);return raw;}
beforeEach(()=>{
 localStorage.clear();localStorage.setItem('user-locale','zh-TW');bodies.clear();vi.stubGlobal('crypto',webcrypto as unknown as Crypto);
 store.get.mockReset().mockImplementation(async(key:string)=>bodies.get(key)??null);store.save.mockReset().mockImplementation(async(key:string,raw:string)=>{if(bodies.has(key)&&bodies.get(key)!==raw)throw Error('CAS');bodies.set(key,raw);});store.clear.mockReset().mockImplementation(async(key:string,raw:string)=>{if(bodies.get(key)!==raw)return false;bodies.delete(key);return true;});
});afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
describe('durable partnership inquiry UI',()=>{
 it('persists before POST and shows verified receipt with accurate mail acceptance',async()=>{
  const fetch=vi.fn(async(_url:unknown,init:RequestInit)=>{expect(original()).not.toBeNull();return ok(ack(JSON.parse(String(init.body)),'ACCEPTED'));});vi.stubGlobal('fetch',fetch);await mount();expect(screen.getByText(/歡迎全台二手商品來源洽談/)).toBeInTheDocument();expect(screen.getByRole('link',{name:'EClaw 合作名片'})).toHaveAttribute('href','https://eclawbot.com/c/pe3vqm');expect(screen.getByRole('link',{name:'hankhuang0516@gmail.com'})).toHaveAttribute('href','mailto:hankhuang0516@gmail.com');fill();submit();await screen.findByText('收件編號：'+receiptId);expect(screen.getByText(/不代表收件匣送達/)).toBeInTheDocument();await waitFor(()=>expect(original()).toBeNull());expect(fetch).toHaveBeenCalledTimes(1);expect(JSON.parse(String(fetch.mock.calls[0][1].body)).clientSubmissionId).toMatch(/^[a-f0-9-]{36}$/);
 });
 it('preserves original ID/body across uncertain response and explicit original retry',async()=>{
  const fetch=vi.fn().mockRejectedValueOnce(Error('raw-secret-provider-detail')).mockImplementation(async(_url:unknown,init:RequestInit)=>ok(ack(JSON.parse(String(init.body)))));vi.stubGlobal('fetch',fetch);await mount();fill();submit();await screen.findByRole('alert');expect(screen.queryByText(/raw-secret/)).not.toBeInTheDocument();expect(screen.getByLabelText('商家／來源名稱')).toHaveAttribute('readonly');fireEvent.click(screen.getByRole('button',{name:'明確重試原合作操作'}));await screen.findByText('合作意向已保存');expect(fetch).toHaveBeenCalledTimes(2);expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty('language');
 });
 it('reopens a saved original in English by GET only without changing original text or language',async()=>{
  const raw=await seed();localStorage.setItem('user-locale','en-US');const fetch=vi.fn(async()=>({ok:false,status:404}));vi.stubGlobal('fetch',fetch);render(<PartnerInquiryPage/>);await screen.findByText(/Receipt is unconfirmed/);expect(screen.getByLabelText('Business or source name')).toHaveValue(input.organization);expect(screen.getByLabelText('Partnership details, actual district, shop, pickup and update method')).toHaveValue(input.message);expect(fetch).toHaveBeenCalledTimes(1);expect((fetch.mock.calls[0] as unknown as [string,RequestInit])[1].method).toBeUndefined();expect(original()).toBe(raw);expect(screen.queryByText('Partnership inquiry saved')).not.toBeInTheDocument();
 });
 it('keeps input during storage failure, sends nothing and safely rereads before another attempt',async()=>{
  store.save.mockRejectedValueOnce(Error('raw-private-storage-key'));const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await mount();fill();submit();await screen.findByText(/無法安全保存原操作/);expect(screen.getByLabelText('商家／來源名稱')).toHaveValue('測試商家');expect(screen.getByRole('button',{name:'送出合作意向'})).toBeDisabled();expect(fetch).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'重試安全讀取'}));await waitFor(()=>expect(screen.getByRole('button',{name:'送出合作意向'})).toBeEnabled());expect(screen.getByLabelText('商家／來源名稱')).toHaveValue('測試商家');expect(fetch).not.toHaveBeenCalled();
 });
 it('freezes malformed encrypted evidence without showing raw error or sending any request',async()=>{bodies.set(await partnerInquiryPendingKey(API_URL),'{invalid-secret');vi.stubGlobal('fetch',vi.fn());render(<PartnerInquiryPage/>);await screen.findByRole('alert');expect(fetch).not.toHaveBeenCalled();expect(screen.queryByText(/invalid-secret/)).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'送出合作意向'})).toBeDisabled();expect(original()).toBe('{invalid-secret');});
 it('rejects weak or wrong receipts and leaves original evidence unconfirmed',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>ok({received:true,inquiryId:'receipt-1',notificationStatus:'ACCEPTED'})));await mount();fill();submit();await screen.findByRole('alert');expect(screen.queryByText('合作意向已保存')).not.toBeInTheDocument();expect(original()).not.toBeNull();expect(store.clear).not.toHaveBeenCalled();});
 it('holds a synchronous duplicate gate and input lock through pending encryption',async()=>{
  let release:()=>void=()=>{};store.save.mockImplementationOnce(async(key:string,raw:string)=>{await new Promise<void>(done=>{release=done;});bodies.set(key,raw);});const fetch=vi.fn(async(_url:unknown,init:RequestInit)=>ok(ack(JSON.parse(String(init.body)))));vi.stubGlobal('fetch',fetch);await mount();fill();submit();fireEvent.submit(screen.getByLabelText('商家／來源名稱').closest('form')!);await waitFor(()=>expect(store.save).toHaveBeenCalledTimes(1));expect(fetch).not.toHaveBeenCalled();expect(screen.getByLabelText('商家／來源名稱')).toBeDisabled();await act(async()=>release());await screen.findByText('合作意向已保存');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('does not dispatch after unmount during persistence and retains the original for recovery',async()=>{
  let release:()=>void=()=>{};store.save.mockImplementationOnce(async(key:string,raw:string)=>{await new Promise<void>(done=>{release=done;});bodies.set(key,raw);});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const view=await mount();fill();submit();await waitFor(()=>expect(store.save).toHaveBeenCalledTimes(1));view.unmount();await act(async()=>release());expect(fetch).not.toHaveBeenCalled();expect(original()).not.toBeNull();expect(store.clear).not.toHaveBeenCalled();
 });
 it('ignores a late ACK after unmount without clearing original evidence',async()=>{
  let release:(value:unknown)=>void=()=>{};vi.stubGlobal('fetch',vi.fn(()=>new Promise(done=>{release=done;})));const view=await mount();fill();submit();await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));const raw=original()!;view.unmount();await act(async()=>release(ok(ack(JSON.parse(raw)))));expect(original()).toBe(raw);expect(store.clear).not.toHaveBeenCalled();
 });
 it('keeps a confirmed receipt through cleanup failure and retries cleanup without network',async()=>{
  const raw=await seed(),fetch=vi.fn(async()=>ok(ack(JSON.parse(raw))));vi.stubGlobal('fetch',fetch);store.clear.mockRejectedValueOnce(Error('storage failed'));render(<PartnerInquiryPage/>);await screen.findByText(/本機恢復紀錄尚未清理/);expect(screen.getByText('合作意向已保存')).toBeInTheDocument();expect(original()).toBe(raw);fireEvent.click(screen.getByRole('button',{name:'重試清理恢復紀錄'}));await waitFor(()=>expect(original()).toBeNull());expect(fetch).toHaveBeenCalledTimes(1);expect(store.clear).toHaveBeenCalledTimes(2);
 });
 it('preserves a competing journal and rereads its original rather than overwriting it',async()=>{
  const winner=await partnerJournal({...input,organization:'另一分頁商家'},'zh-TW');store.save.mockImplementationOnce(async(key:string)=>{bodies.set(key,winner);throw Error('CAS');});const fetch=vi.fn(async()=>({ok:false,status:404}));vi.stubGlobal('fetch',fetch);await mount();fill();submit();await screen.findByText(/無法安全保存原操作/);expect(fetch).not.toHaveBeenCalled();expect(original()).toBe(winner);fireEvent.click(screen.getByRole('button',{name:'重試安全讀取'}));await screen.findByText(/尚未確認收件/);expect(screen.getByLabelText('商家／來源名稱')).toHaveValue('另一分頁商家');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('never clears or shows the wrong operation when a newer journal appears during ACK cleanup',async()=>{
  const raw=await seed(),newer=await partnerJournal({...input,organization:'新合作商家'},'zh-TW');store.clear.mockImplementationOnce(async(key:string)=>{bodies.set(key,newer);return false;});vi.stubGlobal('fetch',vi.fn(async()=>ok(ack(JSON.parse(raw)))));render(<PartnerInquiryPage/>);await screen.findByText('另一份合作操作仍存在；請重新讀取。');expect(original()).toBe(newer);expect(screen.queryByText('合作意向已保存')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'送出合作意向'})).toBeDisabled();
 });
 it('does not submit unconsented or invalid contact data and preserves a valid explicit zero',async()=>{
  const fetch=vi.fn(async(_url:unknown,init:RequestInit)=>ok(ack(JSON.parse(String(init.body)))));vi.stubGlobal('fetch',fetch);await mount();fill();fireEvent.click(screen.getByRole('checkbox'));submit();await screen.findByText(/請核對必填欄位/);expect(fetch).not.toHaveBeenCalled();expect(store.save).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('checkbox'));fireEvent.change(screen.getByLabelText('在售件數（選填，可填 0）'),{target:{value:'0'}});submit();await screen.findByText('合作意向已保存');expect(JSON.parse(String(fetch.mock.calls[0][1].body)).estimatedActiveItems).toBe(0);
 });
 it('falls back to English when optional locale reads fail and remains usable under StrictMode',async()=>{
  vi.spyOn(localStorage,'getItem').mockImplementation(()=>{throw Error('locale unavailable');});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);render(<StrictMode><PartnerInquiryPage/></StrictMode>);await waitFor(()=>expect(screen.getByRole('button',{name:'Send partnership inquiry'})).toBeEnabled());expect(screen.getByRole('heading',{name:'Submit a partnership inquiry'})).toBeInTheDocument();expect(fetch).not.toHaveBeenCalled();
 });
});
