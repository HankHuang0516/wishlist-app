import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import PurchaseHistoryPage from './PurchaseHistoryPage';
const at='2020-01-02T03:04:05.000Z';
const tx={id:1,type:'LIMIT_FOLLOWING',amount:123.4567,currency:'USD',status:'FAILED',createdAt:at};
const gift={id:2,name:'Synthetic gift long name retained entirely',price:'0',currency:'TWD',link:'https://example.invalid/item',imageUrl:null,updatedAt:at,unavailable:false,wishlist:{title:'Synthetic list',user:{id:3,name:'Synthetic owner',nicknames:null,avatarUrl:null}}};
const auth={user:{id:19,phoneNumber:'synthetic'},token:'synthetic-history-session',isAuthenticated:true,login:vi.fn(),logout:vi.fn(),refreshUser:vi.fn()};
const ok=(body:unknown)=>({ok:true,status:200,json:async()=>body});
const page=(value=auth)=><MemoryRouter><AuthContext.Provider value={value}><PurchaseHistoryPage/></AuthContext.Provider></MemoryRouter>;
const region=(kind:'account'|'claims')=>screen.getByRole('region',{name:kind==='account'?'Account transactions':'Gift claims'});
beforeEach(()=>localStorage.setItem('user-locale','en-US'));
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();vi.unstubAllGlobals();});
describe('retained transaction and claim history',()=>{
 it('renders both independent private reads, current claim meaning, original precision,0 and failed status',async()=>{
  const fetcher=vi.fn(async(url:string)=>ok(url.endsWith('purchases')?[gift]:[tx]));vi.stubGlobal('fetch',fetcher);render(page());
  await screen.findByText(gift.name);expect(within(region('account')).getAllByText('USD 123.4567')).toHaveLength(2);expect(within(region('account')).getAllByText('Following capacity')).toHaveLength(2);
  expect(screen.getByText('TWD 0')).toBeInTheDocument();expect(screen.getByText(/not proof of payment or delivery/)).toBeInTheDocument();
  for(const status of within(region('account')).getAllByText('Failed')) expect(status.className).not.toContain('bg-green');
  expect(screen.getByRole('link',{name:'Open original item link'})).toHaveAttribute('rel','noopener noreferrer');expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls.every(c=>!c[1]?.method)).toBe(true);
 });
 it('shows empty only after both successful empty reads',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>ok([])));render(page());await screen.findByText('No account transactions');expect(screen.getByText('No current gift claims')).toBeInTheDocument();expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 });
 it('treats prototype-like stored statuses as unknown text rather than inherited label objects or success',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>ok(url.endsWith('purchases')?[]:[{...tx,status:'__proto__'},{...tx,id:2,status:'constructor'}])));render(page());await screen.findByText('No current gift claims');
  for(const label of ['Other status · __proto__','Other status · constructor'])for(const node of within(region('account')).getAllByText(label))expect(node.className).not.toContain('bg-green');expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 });
 it('keeps successful claims available when transactions fail, and retries only the failed read with a synchronous gate',async()=>{
  let finish!:(value:unknown)=>void;let calls=0;const fetcher=vi.fn(async(url:string)=>url.endsWith('purchases')?ok([gift]):++calls===1?{ok:false,status:500,json:async()=>({private:'error'})}:new Promise(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',fetcher);render(page());
  await screen.findByRole('alert');expect(screen.getByText(gift.name)).toBeInTheDocument();expect(screen.queryByText('No account transactions')).not.toBeInTheDocument();
  const retry=screen.getByRole('button',{name:'Retry account transactions'});fireEvent.click(retry);fireEvent.click(retry);
  expect(calls).toBe(2);expect(fetcher.mock.calls.filter(c=>c[0].endsWith('purchases'))).toHaveLength(1);await act(async()=>finish(ok([tx])));
  expect(within(region('account')).getAllByText('USD 123.4567')).toHaveLength(2);expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 });
 it('keeps successful transactions while an invalid claim body requires safe reread',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>ok(url.endsWith('purchases')?[{...gift,unavailable:true}]:[tx])));render(page());await screen.findByRole('alert');
  expect(within(region('account')).getAllByText('USD 123.4567')).toHaveLength(2);expect(screen.queryByText('No current gift claims')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Retry gift claims'})).toBeInTheDocument();expect(screen.queryByText(gift.name)).not.toBeInTheDocument();
 });
 it('keeps an unread section loading without declaring it empty when the other read settles',async()=>{
  let finish!:(value:unknown)=>void;vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('purchases')?new Promise(resolve=>{finish=resolve;}):ok([])));render(page());await screen.findByText('No account transactions');expect(within(region('claims')).getByRole('status')).toHaveTextContent('Reading history');expect(screen.queryByText('No current gift claims')).not.toBeInTheDocument();await act(async()=>finish(ok([])));expect(screen.getByText('No current gift claims')).toBeInTheDocument();
 });
 it('offers the original login return destination on expired auth without a success or empty claim',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:401,json:async()=>[]})));render(page());await screen.findAllByRole('alert');for(const link of screen.getAllByRole('link',{name:'Sign in to view history'}))expect(link).toHaveAttribute('href','/login?next=%2Fpurchase-history');expect(screen.queryByText('No account transactions')).not.toBeInTheDocument();
 });
 it('anonymous users cause no private requests and retain a usable return link',()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(page({...auth,user:null,token:null,isAuthenticated:false} as unknown as typeof auth));expect(fetcher).not.toHaveBeenCalled();expect(screen.getByRole('link',{name:'Sign in to view history'})).toHaveAttribute('href','/login?next=%2Fpurchase-history');
 });
 it('never shows an older account late response and aborts its reads before a new identity mounts',async()=>{
  const resolvers:Array<(value:unknown)=>void>=[];const signals:AbortSignal[]=[];vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{signals.push(init.signal as AbortSignal);return (init.headers as Record<string,string>).Authorization==='Bearer synthetic-history-session'?new Promise(resolve=>resolvers.push(resolve)):ok([]);}));
  const mounted=render(page());expect(resolvers).toHaveLength(2);mounted.rerender(page({...auth,user:{id:20,phoneNumber:'other'},token:'synthetic-other-session'}));await screen.findByText('No account transactions');expect(signals.slice(0,2).every(s=>s.aborted)).toBe(true);
  await act(async()=>{resolvers[0](ok([tx]));resolvers[1](ok([gift]));});expect(screen.queryByText(gift.name)).not.toBeInTheDocument();expect(screen.queryByText('USD 123.4567')).not.toBeInTheDocument();
 });
 it('restarts for token rotation and ignores both old late failure and old JSON',async()=>{
  let finish!:(value:unknown)=>void;vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>((init.headers as Record<string,string>).Authorization==='Bearer synthetic-history-session'&&url.endsWith('purchases'))?new Promise(resolve=>{finish=resolve;}):ok([])));
  const mounted=render(page());await screen.findByText('No account transactions');mounted.rerender(page({...auth,token:'rotated-synthetic-session'}));await screen.findByText('No current gift claims');await act(async()=>finish({ok:false,status:401}));expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 });
 it('departure aborts outstanding reads without later private rendering',async()=>{
  const pending:Array<(value:unknown)=>void>=[];const signals:AbortSignal[]=[];vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{signals.push(init.signal as AbortSignal);return new Promise(resolve=>pending.push(resolve));}));const mounted=render(page());mounted.unmount();expect(signals.every(s=>s.aborted)).toBe(true);await act(async()=>pending.forEach(f=>f(ok([gift]))));expect(screen.queryByText(gift.name)).not.toBeInTheDocument();
 });
 it('renders inaccessible claims without their private fields or links and removes unsafe URLs',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>ok(url.endsWith('purchases')?[{id:4,updatedAt:at,unavailable:true},{...gift,link:'javascript:alert(1)',imageUrl:'data:text/html,bad'}]:[])));render(page());await screen.findByText('This claimed wish is currently unavailable');expect(screen.getByText('Link unavailable')).toBeInTheDocument();expect(screen.queryByRole('link',{name:'Open original item link'})).not.toBeInTheDocument();expect(screen.queryByRole('img')).not.toBeInTheDocument();
 });
 it('renders Chinese labels and still works in English when locale storage fails',async()=>{
  localStorage.setItem('user-locale','zh-TW');vi.stubGlobal('fetch',vi.fn(async()=>ok([])));const mounted=render(page());await screen.findByText('沒有帳號交易紀錄');expect(screen.getByRole('link',{name:'返回設定'})).toHaveAttribute('href','/settings');mounted.unmount();const get=vi.spyOn(window.localStorage,'getItem').mockImplementation(()=>{throw Error('unavailable');});render(page());await screen.findByText('No account transactions');get.mockRestore();
 });
});
