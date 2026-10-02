import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import FeedbackModal from './FeedbackModal';
import { feedbackJournal } from '../lib/feedbackWeb';
import { StrictMode } from 'react';
import { API_URL } from '../config';
import { feedbackPendingKey } from '../lib/webPendingStore';

const state=vi.hoisted(()=>({values:new Map<string,string>(),get:vi.fn(),save:vi.fn(),clear:vi.fn(),fetch:vi.fn()}));
vi.mock('../lib/webPendingStore',async importOriginal=>{
 const original=await importOriginal<typeof import('../lib/webPendingStore')>();
 return {...original,privatePendingStore:{get:state.get,save:state.save,clear:state.clear}};
});
const anonymous={user:null,token:null,isAuthenticated:false,login:vi.fn(),logout:vi.fn(),refreshUser:vi.fn()};
const signed=(id:number)=>({...anonymous,user:{id,phoneNumber:'fixture',nicknames:'fixture'},token:'synthetic-'+id,isAuthenticated:true});
function mount(auth=anonymous){return render(<AuthContext.Provider value={auth}><FeedbackModal isOpen onClose={vi.fn()}/></AuthContext.Provider>);}
async function ready(){await waitFor(()=>expect(screen.getByLabelText('Issue or feedback')).not.toBeDisabled());}
function fill(){fireEvent.change(screen.getByLabelText('Issue or feedback'),{target:{value:'原文字 🦉 {id}'}});const email=screen.queryByLabelText('Email (Required for reply)');if(email)fireEvent.change(email,{target:{value:'Fixture@Example.invalid'}});}
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
function receipt(body:Record<string,unknown>){return {received:true,clientSubmissionId:body.clientSubmissionId,requestHash:body.requestHash,inquiryId:'22222222-2222-4222-8222-222222222222',notificationStatus:'ACCEPTED',message:'raw-secret-provider-error',aiAnalysis:'raw-private-detail'};}
function posts(){return state.fetch.mock.calls.filter(([,options])=>options?.method==='POST');}
beforeEach(()=>{
 vi.resetAllMocks();state.values.clear();localStorage.clear();localStorage.setItem('user-locale','en-US');
 vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('fetch',state.fetch);
 state.get.mockImplementation(async(key:string)=>state.values.get(key)??null);
 state.save.mockImplementation(async(key:string,value:string)=>{if(state.values.has(key)&&state.values.get(key)!==value)throw Error('immutable');state.values.set(key,value);});
 state.clear.mockImplementation(async(key:string,value:string)=>state.values.get(key)===value?state.values.delete(key):false);
 state.fetch.mockImplementation(async(_url:string,options?:RequestInit)=>options?.method==='POST'?response(receipt(JSON.parse(String(options.body))),201):response({errorCode:'SUBMISSION_UNCONFIRMED'},404));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('durable feedback dialog',()=>{
 it('StrictMode restores a pending operation by one current GET and no mutation',async()=>{
  const raw=await feedbackJournal('original','fixture@example.invalid',null,'en-US');state.values.set(await feedbackPendingKey(API_URL,null),raw);
  state.fetch.mockResolvedValueOnce(response(receipt(JSON.parse(raw))));render(<StrictMode><AuthContext.Provider value={anonymous}><FeedbackModal isOpen onClose={vi.fn()}/></AuthContext.Provider></StrictMode>);
  await screen.findByText(/Receipt number:/);expect(state.fetch).toHaveBeenCalledTimes(1);expect(posts()).toHaveLength(0);expect(state.values.size).toBe(0);
 });
 it('labels fields, traps focus, saves before dispatch and displays only verified receipt facts',async()=>{
  mount();await ready();expect(screen.getByRole('dialog')).toHaveFocus();fill();fireEvent.click(screen.getByRole('button',{name:'Submit Feedback'}));
  await screen.findByText(/Receipt number:/);expect(posts()).toHaveLength(1);expect(state.values.size).toBe(0);
  expect(state.save.mock.invocationCallOrder[0]).toBeLessThan(state.fetch.mock.invocationCallOrder[0]);
  expect(screen.getByText(/inbox delivery is not confirmed/)).toBeInTheDocument();expect(screen.queryByText(/raw-secret|raw-private/)).not.toBeInTheDocument();
 });
 it('holds a synchronous duplicate gate while encrypted persistence is still pending',async()=>{
  let finish:()=>void=()=>{};state.save.mockImplementationOnce((key:string,value:string)=>new Promise<void>(resolve=>{finish=()=>{state.values.set(key,value);resolve();};}));
  mount();await ready();fill();const form=screen.getByLabelText('Issue or feedback').closest('form')!;
  fireEvent.submit(form);fireEvent.submit(form);await waitFor(()=>expect(state.save).toHaveBeenCalledTimes(1));expect(posts()).toHaveLength(0);
  await act(async()=>finish());await screen.findByText(/Receipt number:/);expect(posts()).toHaveLength(1);
 });
 it('restores lost replies with GET only, retaining the original identity and body hash',async()=>{
  let sent:Record<string,unknown>={};state.fetch.mockImplementationOnce(async(_url:string,options:RequestInit)=>{sent=JSON.parse(String(options.body));throw Error('reply lost');});
  const first=mount();await ready();fill();fireEvent.click(screen.getByRole('button',{name:'Submit Feedback'}));await screen.findByText(/Receipt is unconfirmed/);first.unmount();
  state.fetch.mockImplementationOnce(async()=>response(receipt(sent)));mount();await screen.findByText(/Receipt number:/);
  expect(posts()).toHaveLength(1);expect(state.fetch.mock.calls[1][0]).toContain('/submissions/'+sent.clientSubmissionId);
  expect(state.fetch.mock.calls[1][1]).toMatchObject({cache:'no-store',redirect:'error',headers:{'X-Submission-Hash':sent.requestHash}});expect(state.values.size).toBe(0);
 });
 it('explicit retries use the exact persisted operation, even after the display language changes',async()=>{
  state.fetch.mockRejectedValueOnce(Error('lost'));const first=mount();await ready();fill();fireEvent.click(screen.getByRole('button',{name:'Submit Feedback'}));await screen.findByText(/Receipt is unconfirmed/);
  const original=posts()[0][1].body;first.unmount();localStorage.setItem('user-locale','zh-TW');mount();await screen.findByText(/尚未確認收件/);
  expect(posts()).toHaveLength(1);expect(screen.getByLabelText('問題與回饋內容')).toHaveValue('原文字 🦉 {id}');fireEvent.click(screen.getByRole('button',{name:'明確重試原回饋操作'}));await screen.findByText(/收件編號：/);
  expect(posts()).toHaveLength(2);expect(posts()[1][1].body).toBe(original);expect(JSON.parse(String(original)).language).toBe('en-US');
 });
 it.each([{received:false},{clientSubmissionId:'33333333-3333-4333-8333-333333333333'},{requestHash:'a'.repeat(64)},{inquiryId:'not-uuid'},{notificationStatus:'DELIVERED'}])('rejects malformed successful ACK %# without clearing the journal or user text',async patch=>{
  state.fetch.mockImplementationOnce(async(_url:string,options:RequestInit)=>response({...receipt(JSON.parse(String(options.body))),...patch},201));
  mount();await ready();fill();fireEvent.click(screen.getByRole('button',{name:'Submit Feedback'}));await screen.findByText(/Receipt is unconfirmed/);
  expect(state.values.size).toBe(1);expect(state.clear).not.toHaveBeenCalled();expect(screen.getByLabelText('Issue or feedback')).toHaveValue('原文字 🦉 {id}');expect(screen.queryByText(/Receipt number:/)).not.toBeInTheDocument();
 });
 it('keeps failed mail notification distinct from a durably saved feedback record',async()=>{
  state.fetch.mockImplementationOnce(async(_url:string,options:RequestInit)=>response({...receipt(JSON.parse(String(options.body))),notificationStatus:'FAILED'},201));
  mount();await ready();fill();fireEvent.click(screen.getByRole('button',{name:'Submit Feedback'}));await screen.findByText(/Feedback was saved. Notification delivery is unconfirmed/);expect(state.values.size).toBe(0);
 });
 it('failed persistence sends nothing and preserves text for copying',async()=>{
  state.save.mockRejectedValueOnce(Error('raw-disk-detail'));mount();await ready();fill();fireEvent.click(screen.getByRole('button',{name:'Submit Feedback'}));await screen.findByText(/Nothing was sent/);
  expect(posts()).toHaveLength(0);expect(screen.getByLabelText('Issue or feedback')).toHaveValue('原文字 🦉 {id}');expect(screen.getByLabelText('Issue or feedback')).toHaveAttribute('readonly');expect(screen.queryByText(/raw-disk-detail/)).not.toBeInTheDocument();
 });
 it.each(['read-failure','corrupt-journal'])('fails closed on unsafe restoration %s',async mode=>{
  if(mode==='read-failure')state.get.mockRejectedValueOnce(Error('raw-detail'));else state.get.mockResolvedValueOnce('{bad json');
  mount();await screen.findByText(/Recovery data could not be read safely/);expect(state.fetch).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Submit Feedback'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Retry safe reading'}));await ready();fill();fireEvent.click(screen.getByRole('button',{name:'Submit Feedback'}));await screen.findByText(/Receipt number:/);
 });
 it('verified replies with failed cleanup permit only cleanup and never a second POST',async()=>{
  state.clear.mockRejectedValueOnce(Error('cleanup fault'));mount();await ready();fill();fireEvent.click(screen.getByRole('button',{name:'Submit Feedback'}));await screen.findByText(/local recovery journal needs cleanup/);
  expect(screen.queryByRole('button',{name:'Retry original feedback operation'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Retry recovery journal cleanup'}));await waitFor(()=>expect(state.values.size).toBe(0));expect(posts()).toHaveLength(1);
 });
 it('does not erase another tab journal after the original is acknowledged',async()=>{
  const newer=await feedbackJournal('newer operation','other@example.invalid',null,'en-US');
  state.clear.mockImplementationOnce(async(key:string)=>{state.values.set(key,newer);return false;});mount();await ready();fill();fireEvent.click(screen.getByRole('button',{name:'Submit Feedback'}));await screen.findByText(/Another feedback operation remains/);
  expect([...state.values.values()]).toEqual([newer]);expect(screen.queryByText(/Receipt number:/)).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Retry original feedback operation'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Retry safe reading'}));await screen.findByText(/Receipt is unconfirmed/);expect(screen.getByLabelText('Issue or feedback')).toHaveValue('newer operation');expect(posts()).toHaveLength(1);
 });
 it('fences a late reply after departure without clearing an unresolved journal',async()=>{
  let finish:(value:Response)=>void=()=>{};state.fetch.mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve;}));const view=mount();await ready();fill();fireEvent.click(screen.getByRole('button',{name:'Submit Feedback'}));await waitFor(()=>expect(posts()).toHaveLength(1));const original=JSON.parse(String(posts()[0][1].body));view.unmount();
  await act(async()=>finish(response(receipt(original),201)));expect(state.clear).not.toHaveBeenCalled();expect(state.values.size).toBe(1);
 });
 it('isolates signed-in owners and does not reinterpret a revoked session as anonymous feedback',async()=>{
  let finish:(value:Response)=>void=()=>{};state.fetch.mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve;}));
  const view=mount(signed(42) as typeof anonymous);await ready();fill();expect(screen.queryByLabelText('Email (Required for reply)')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Submit Feedback'}));await waitFor(()=>expect(posts()).toHaveLength(1));const original=JSON.parse(String(posts()[0][1].body));
  view.rerender(<AuthContext.Provider value={signed(43)}><FeedbackModal isOpen onClose={vi.fn()}/></AuthContext.Provider>);await ready();await act(async()=>finish(response(receipt(original),201)));
  expect(screen.queryByText(/Receipt number:/)).not.toBeInTheDocument();expect(state.clear).not.toHaveBeenCalled();expect(state.values.size).toBe(1);expect(posts()[0][1].headers).toMatchObject({Authorization:'Bearer synthetic-42'});expect(original).not.toHaveProperty('email');
 });
 it('closing and reopening retains unsent text and performs no mutation',async()=>{
  const view=mount();await ready();fill();view.rerender(<AuthContext.Provider value={anonymous}><FeedbackModal isOpen={false} onClose={vi.fn()}/></AuthContext.Provider>);
  view.rerender(<AuthContext.Provider value={anonymous}><FeedbackModal isOpen onClose={vi.fn()}/></AuthContext.Provider>);await ready();expect(screen.getByLabelText('Issue or feedback')).toHaveValue('原文字 🦉 {id}');expect(state.fetch).not.toHaveBeenCalled();
 });
});
