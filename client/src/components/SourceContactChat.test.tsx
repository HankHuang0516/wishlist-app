import {describe,it,expect,vi,afterEach,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import SourceContactChat from './SourceContactChat';
import ExplorePage from '../pages/ExplorePage';
import ChatPage from '../pages/ChatPage';
import { webcrypto } from 'node:crypto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createWebPendingStore, privatePendingStore, PendingStoreError } from '../lib/webPendingStore';
import { sourceJournalKey } from '../lib/sourceInquiryRecovery';
import { API_URL } from '../config';
let vault: ReturnType<typeof createWebPendingStore>;
vi.mock('../lib/webPendingStore', async importOriginal => {
 const original = await importOriginal<typeof import('../lib/webPendingStore')>();
 return {...original,privatePendingStore:{get:(...args:Parameters<typeof vault.get>)=>vault.get(...args),save:(...args:Parameters<typeof vault.save>)=>vault.save(...args),clear:(...args:Parameters<typeof vault.clear>)=>vault.clear(...args)}};
});

const auth=vi.hoisted(()=>({token:'synthetic-token' as string|null,user:{id:1}}));
vi.mock('../context/AuthContext',()=>({useAuth:()=>auth}));
vi.mock('./ExploreMapWeb',()=>({default:(props:any)=><div data-testid="original-map"><output>{props.sourceLeads?.length}</output><output data-testid="source-map-frame">{JSON.stringify(props.frame)}</output><button onClick={()=>props.onCluster('source',props.sourceLeads.map((r:any)=>r.id))}>來源群聚</button></div>}));
const id='d897f4d9-1e66-4a0d-bd3f-1861f0e6cb46',roomId='9269fe36-ff74-4f18-a87c-f56cb826b240';
const now=()=>new Date().toISOString();
const source=()=>({id,kind:'SOURCE_LEAD',title:'合成測試來源商品',summary:'僅供本地測試',canonicalUrl:'https://example.invalid/source/one',county:'臺南市',district:'永康區',publicPlaceName:'公共面交點',publicAddress:'公開地點',latitude:23,longitude:120.2,postedEarliestAt:now(),postedLatestAt:now(),checkedAt:now(),stockStatus:'UNKNOWN',qualifiedSupply:false,checkoutEnabled:false,notice:'待確認',publicFacts:null,coordinateSourceUrl:'https://www.openstreetmap.org/node/1',coordinateAttribution:null,media:[]});
const emptyRoom=()=>({id:roomId,leadId:id,available:true,state:'INQUIRY',transferHash:'a'.repeat(64),events:[] as any[],routeVerified:false,delivered:false,delivery:null,checkoutEnabled:false,orderCreated:false,notice:'不下訂'});
beforeEach(()=>{localStorage.setItem('user-locale','zh-TW');vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('IDBKeyRange',IDBKeyRange);vault=createWebPendingStore(crypto.randomUUID(),new IDBFactory(),webcrypto as unknown as Crypto)});
afterEach(()=>{auth.token='synthetic-token';sessionStorage.clear();cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()});
function fixture({unknown=false,reject=false,wrong=false,uncommitted=false}: {unknown?:boolean;reject?:boolean;wrong?:boolean;uncommitted?:boolean}={}) {
 let room:any=null;let actions=0;const receipts=new Map<string,any>();let rejectStatus=reject?409:0;let receiptUnavailable=false;
 const fetch=vi.fn(async(url:string,init:any)=>{
  const path=new URL(url,'https://example.invalid').pathname;
  const ok=(value:any)=>({ok:true,status:200,headers:new Headers(),json:async()=>value});
  if(path.endsWith('/inquiries/mine'))return ok({items:room?[{id:room.id,state:room.state,context:source()}]:[],nextCursor:null});
  if(path.endsWith('/source-leads'))return ok({enabled:true,items:[source()],nextCursor:null});
  if(path.endsWith('/inquiry')){if(init?.method==='POST'&&!room)room=emptyRoom();return ok(wrong?{...emptyRoom(),leadId:'aaaabbbb-cccc-4ddd-8eee-123456789012'}:room);}
  if(path.includes('/actions/')){const operation=receipts.get(path.split('/').at(-1)!);return ok(operation&&!receiptUnavailable?{leadId:id,roomId,operation,room}:null);}
  if(path.endsWith('/actions')){actions++;const b=JSON.parse(init.body);if(rejectStatus&&b.action==='ASK')return{ok:false,status:rejectStatus,headers:new Headers({'Retry-After':'1'}),json:async()=>({errorCode:rejectStatus===429?'SOURCE_BUSY':'SYNTHETIC_FAILURE',error:'private raw error must not be displayed'})};if(uncommitted&&actions===1)throw Error('private unknown before commit');if(!receipts.has(b.requestId)){room={...room,state:b.action==='CANCEL'?'CANCELLED':'WAITING_ROUTE',transferHash:'b'.repeat(64),events:[...room.events,{requestId:b.requestId,action:b.action,...(b.text===undefined?{}:{text:b.text}),at:now()}]};receipts.set(b.requestId,b);}if(unknown&&actions===1)throw Error('private unknown after save');return ok(room);}
  if(path.endsWith('/source-leads/'+id))return ok(source());
  if(path.includes('external-listings'))return ok({enabled:false,items:[],nextCursor:null});
  return ok({items:[],nextCursor:null});
 });vi.stubGlobal('fetch',fetch);return{fetch,getRoom:()=>room,getActions:()=>actions,setRoom:(r:any)=>room=r,setReject:(n:number)=>rejectStatus=n,setReceiptUnavailable:(v:boolean)=>receiptUnavailable=v};
}
async function enter() {const onBack=vi.fn();render(<MemoryRouter><SourceContactChat source={source()} onBack={onBack}/></MemoryRouter>);await waitFor(()=>expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false));return onBack;}
async function send(text='請確認現貨'){fireEvent.change(screen.getByRole('textbox'),{target:{value:text}});fireEvent.click(screen.getByRole('button',{name:'送出並委託聯絡賣家'}));await waitFor(()=>expect(screen.getByRole('button',{name:'更新'})).not.toBeDisabled());}
describe('source contact inside the original Explore and Chat',()=>{
 it('original card → detail → original chat → one explicit send → same source on return',async()=>{const f=fixture();render(<MemoryRouter initialEntries={['/explore']}><Routes><Route path="/explore" element={<ExplorePage/>}/><Route path="/chat" element={<ChatPage/>}/></Routes></MemoryRouter>);fireEvent.click(await screen.findByRole('button',{name:'查看合成測試來源商品商品詳情'}));await screen.findByRole('dialog',{name:'外部來源商品'});fireEvent.click(screen.getByRole('link',{name:/聯絡賣家/}));await screen.findByRole('dialog',{name:'Wishlist AI 聊聊'});await waitFor(()=>expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false));expect(screen.queryByRole('checkbox')).toBeNull();await send();await screen.findByText(/已接至 Wishlist AI 收件/);expect(f.getActions()).toBe(1);fireEvent.click(screen.getByRole('button',{name:'返回商品'}));const returned=await screen.findByRole('dialog',{name:'外部來源商品'});expect(returned).toHaveTextContent('合成測試來源商品');expect(f.getActions()).toBe(1);});
 it('opening only reads; a single send carries item-bounded consent and no fake delivery',async()=>{const f=fixture();await enter();expect(f.fetch.mock.calls.filter(([u,i])=>u.includes('/inquiry')&&i?.method==='POST')).toHaveLength(0);expect(screen.getByText(/商品ID：/)).toHaveTextContent(id);await send();await screen.findByText(/已接至 Wishlist AI 收件/);const body=JSON.parse(f.fetch.mock.calls.find(([u])=>u.includes('/actions'))![1].body);expect(body).toMatchObject({action:'ASK',text:'請確認現貨',consent:true,transferHash:'a'.repeat(64)});expect(screen.getByText(/詢問編號：/)).toHaveTextContent('尚未送給賣家');expect(screen.queryByRole('checkbox')).toBeNull();});
 it('purchase intention remains an editable draft, not an order or automatic send',async()=>{const f=fixture();await enter();fireEvent.click(screen.getByRole('button',{name:'我想購買，先代問現貨與條件'}));expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('購買意願');expect(f.getActions()).toBe(0);expect(screen.getByText(/不會下訂或付款/)).toBeTruthy();});
 it('unknown send recovers original receipt by GET without a replacement send',async()=>{const f=fixture({unknown:true});await enter();await send('請問價格');await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'更新'}));await screen.findByText('請問價格');expect(f.getActions()).toBe(1);expect(sessionStorage.getItem('source-lead-request:1:'+id)).toBeNull();});
 it('cancels only the existing item thread',async()=>{const f=fixture();await enter();await send('詢問尺寸');await screen.findByText('詢問尺寸');fireEvent.click(screen.getByRole('button',{name:'撤回委託'}));await screen.findByText('後續代問已取消。');expect(f.getActions()).toBe(2);});
 it('rejection retains the original operation until receipt lookup or explicit withdrawal',async()=>{const f=fixture({reject:true});await enter();await send('問題');await screen.findByRole('alert');const key=await sourceJournalKey(API_URL,1,id);expect(JSON.parse((await vault.get(key))!).payload.text).toBe('問題');expect(screen.queryByText(/已人工轉交/)).toBeNull();fireEvent.click(screen.getByRole('button',{name:'撤回委託'}));await screen.findByText('後續代問已取消。');await waitFor(async()=>expect(await vault.get(key)).toBeNull());expect(f.getActions()).toBe(2);});
 it('rejects a room bound to another product',async()=>{const f=fixture({wrong:true});render(<MemoryRouter><SourceContactChat source={source()} onBack={()=>{}}/></MemoryRouter>);await screen.findByRole('alert');expect(f.getActions()).toBe(0);expect(screen.queryByText(/詢問編號/)).toBeNull();});
 it('logout immediately hides buyer-owned question history',async()=>{const f=fixture();const v=render(<MemoryRouter><SourceContactChat source={source()} onBack={()=>{}}/></MemoryRouter>);await waitFor(()=>expect(screen.getByRole('textbox')).not.toBeDisabled());await send('私有問題');await screen.findByText('私有問題');auth.token=null;v.rerender(<MemoryRouter><SourceContactChat source={source()} onBack={()=>{}}/></MemoryRouter>);expect(screen.queryByText('私有問題')).toBeNull();expect(screen.getByRole('link',{name:'登入後聯絡賣家'})).toBeTruthy();expect(f.getActions()).toBe(1);});
 it('renders seller reply only in the owned bound thread',async()=>{const f=fixture();f.setRoom({...emptyRoom(),state:'DELIVERED',routeVerified:true,delivered:true,delivery:{at:now(),channel:'EMAIL',verification:'MANUAL_UI_RECEIPT'},events:[{requestId:crypto.randomUUID(),action:'SELLER_REPLY',text:'合成賣家回覆：可取貨',at:now()}]});render(<MemoryRouter><SourceContactChat source={source()} onBack={()=>{}}/></MemoryRouter>);await screen.findByText('原賣家回覆 · Wishlist AI 代轉：合成賣家回覆：可取貨');expect(screen.queryByRole('textbox')).toBeNull();expect(f.getActions()).toBe(0);});
 it('waits for the same new query source page before framing and never selects old rows',async()=>{
  let finish!:(v:any)=>void;
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{const u=new URL(url,'https://example.invalid');if(u.pathname.endsWith('/source-leads')){if(u.searchParams.get('q')==='B')return new Promise(resolve=>{finish=resolve;});return {ok:true,status:200,json:async()=>({enabled:true,items:[source()],nextCursor:null})};}return {ok:true,status:200,json:async()=>({...(u.pathname.includes('external-listings')?{enabled:false}:{}),items:[],nextCursor:null})};}));
  render(<MemoryRouter><ExplorePage/></MemoryRouter>);await screen.findByRole('button',{name:'查看合成測試來源商品商品詳情'});await waitFor(()=>expect(screen.getByTestId('source-map-frame')).toHaveTextContent('120.2'));
  fireEvent.change(screen.getByRole('searchbox',{name:'商品關鍵字'}),{target:{value:'B'}});fireEvent.click(screen.getByRole('button',{name:'搜尋'}));await waitFor(()=>expect(finish).toBeDefined());expect(screen.queryByRole('button',{name:'查看合成測試來源商品商品詳情'})).toBeNull();
  finish({ok:true,status:200,json:async()=>({enabled:true,items:[{...source(),id:'b897f4d9-1e66-4a0d-bd3f-1861f0e6cb46',title:'B新範圍來源',canonicalUrl:'https://example.invalid/source/two',longitude:120.45,latitude:23.1}],nextCursor:null})});
  await screen.findByRole('button',{name:'查看B新範圍來源商品詳情'});await waitFor(()=>expect(screen.getByTestId('source-map-frame')).toHaveTextContent('120.45'));expect(screen.queryByRole('button',{name:'查看合成測試來源商品商品詳情'})).toBeNull();
 });
 it.each(['DELIVERY_REQUIRES_REVIEW','CANCEL_REQUESTED'])('never labels a %s receipt as completed forwarding',async(state)=>{const f=fixture();f.setRoom({...emptyRoom(),state,delivered:true,delivery:{at:now(),channel:'EMAIL',verification:'MANUAL_UI_RECEIPT'}});render(<MemoryRouter><SourceContactChat source={source()} onBack={()=>{}}/></MemoryRouter>);await screen.findByText(/需要人工核查或正在撤回/);expect(screen.queryByText(/已人工轉交/)).toBeNull();expect(screen.queryByRole('textbox')).toBeNull();});
 it('stops an unavailable waiting source instead of promising to forward it',async()=>{const f=fixture();f.setRoom({...emptyRoom(),state:'WAITING_ROUTE',available:false});render(<MemoryRouter><SourceContactChat source={source()} onBack={()=>{}}/></MemoryRouter>);await screen.findByText(/後續代問已停止/);expect(screen.queryByText(/下一步核實原賣家路由/)).toBeNull();expect(screen.queryByRole('textbox')).toBeNull();});

 it('reload restores the exact uncommitted question and only explicit retry sends its original body',async()=>{
  const f=fixture({uncommitted:true});await enter();await send('原問題，含換行\n請確認數量');const key=await sourceJournalKey(API_URL,1,id),before=await vault.get(key);
  cleanup();await enterLocked();expect(f.getActions()).toBe(1);expect(await vault.get(key)).toBe(before);expect(screen.getByRole('textbox')).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'重新送出原操作'}));await waitFor(()=>expect(f.getActions()).toBe(2));await waitFor(async()=>expect(await vault.get(key)).toBeNull());
  const bodies=f.fetch.mock.calls.filter(([u,i])=>u.includes('/actions')&&i?.method==='POST').map(([,i])=>JSON.parse(i.body));expect(bodies[1]).toEqual(bodies[0]);expect(f.getRoom().events).toHaveLength(1);
 });
 it.each([401,429])('a later %s cannot discard the previously unknown request',async status=>{
  const f=fixture({uncommitted:true});await enter();await send('保留原問題');const key=await sourceJournalKey(API_URL,1,id),before=await vault.get(key);f.setReject(status);
  fireEvent.click(screen.getByRole('button',{name:'重新送出原操作'}));await waitFor(()=>expect(f.getActions()).toBe(2));await waitFor(()=>expect(screen.getByRole('button',{name:'更新'})).not.toBeDisabled());expect(await vault.get(key)).toBe(before);expect(screen.getByRole('alert')).not.toHaveTextContent('private raw error');
  f.setReject(0);fireEvent.click(screen.getByRole('button',{name:'重新送出原操作'}));await waitFor(async()=>expect(await vault.get(key)).toBeNull());expect(f.getActions()).toBe(3);expect(f.getRoom().events).toHaveLength(1);
 });
 it('read failure stays closed while preserving server-owned history and recovers explicitly',async()=>{
  const f=fixture();f.setRoom({...emptyRoom(),events:[{requestId:crypto.randomUUID(),action:'ASK',text:'已存歷史',at:now()}]});const fault=vi.spyOn(privatePendingStore,'get').mockRejectedValue(new PendingStoreError());
  render(<MemoryRouter><SourceContactChat source={source()} onBack={()=>{}}/></MemoryRouter>);await screen.findByRole('alert');expect(screen.getByText('已存歷史')).toBeTruthy();expect(screen.getByRole('textbox')).toBeDisabled();expect(f.getActions()).toBe(0);
  fault.mockRestore();fireEvent.click(screen.getByRole('button',{name:'重試恢復已存操作'}));await waitFor(()=>expect(screen.getByRole('textbox')).not.toBeDisabled());expect(f.getActions()).toBe(0);
 });
 it('save failure prevents the action POST and retains the editable original draft',async()=>{
  const f=fixture();await enter();const fault=vi.spyOn(privatePendingStore,'save').mockRejectedValue(new PendingStoreError());await send('不得未存就送出');expect(f.getActions()).toBe(0);expect(screen.getByRole('alert')).toHaveTextContent('安全');expect(screen.getByRole('textbox')).toHaveValue('不得未存就送出');fault.mockRestore();
  fireEvent.click(screen.getByRole('button',{name:'重試恢復已存操作'}));await waitFor(()=>expect(screen.getByRole('textbox')).not.toBeDisabled());await send('不得未存就送出');expect(f.getActions()).toBe(1);
 });
 it('cleanup failure retains proof and explicit read resolves it without a second POST',async()=>{
  const f=fixture();await enter();const fault=vi.spyOn(privatePendingStore,'clear').mockRejectedValue(new PendingStoreError());await send('清理失敗仍保留');const key=await sourceJournalKey(API_URL,1,id);expect(await vault.get(key)).not.toBeNull();expect(screen.getByRole('alert')).toHaveTextContent('安全');fault.mockRestore();
  fireEvent.click(screen.getByRole('button',{name:'重試恢復已存操作'}));await waitFor(async()=>expect(await vault.get(key)).toBeNull());expect(f.getActions()).toBe(1);
 });
 it('successful POST without an exact receipt retains proof across reopening, then read resolves it',async()=>{
  const f=fixture();f.setReceiptUnavailable(true);await enter();await send('需精確回執');const key=await sourceJournalKey(API_URL,1,id),before=await vault.get(key);expect(before).not.toBeNull();cleanup();await enterLocked();expect(await vault.get(key)).toBe(before);expect(f.getActions()).toBe(1);
  f.setReceiptUnavailable(false);fireEvent.click(screen.getByRole('button',{name:'更新'}));await waitFor(async()=>expect(await vault.get(key)).toBeNull());expect(f.getActions()).toBe(1);
 });
 it('legacy identity is migrated without reconstructing or sending a new question',async()=>{
  const f=fixture();f.setRoom(emptyRoom());sessionStorage.setItem('source-lead-request:1:'+id,JSON.stringify({requestId:crypto.randomUUID(),action:'ASK'}));await enterLocked();expect(screen.getByText(/舊版只保存了操作編號/)).toBeTruthy();expect(screen.queryByRole('button',{name:'重新送出原操作'})).toBeNull();expect(sessionStorage.getItem('source-lead-request:1:'+id)).toBeNull();expect(f.getActions()).toBe(0);
  fireEvent.click(screen.getByRole('button',{name:'撤回委託'}));await screen.findByText('後續代問已取消。');await waitFor(async()=>expect(await vault.get(await sourceJournalKey(API_URL,1,id))).toBeNull());expect(f.getActions()).toBe(1);
 });
 it('corrupt old metadata cannot be interpreted as no pending action',async()=>{
  const f=fixture();sessionStorage.setItem('source-lead-request:1:'+id,'broken');render(<MemoryRouter><SourceContactChat source={source()} onBack={()=>{}}/></MemoryRouter>);await screen.findByRole('alert');expect(screen.getByRole('textbox')).toBeDisabled();expect(f.getActions()).toBe(0);expect(sessionStorage.getItem('source-lead-request:1:'+id)).toBe('broken');
 });
 it('English recovery controls have bounded product wording and retain the original question',async()=>{
  localStorage.setItem('user-locale','en-US');const f=fixture({uncommitted:true});render(<MemoryRouter><SourceContactChat source={source()} onBack={()=>{}}/></MemoryRouter>);await waitFor(()=>expect(screen.getByRole('textbox',{name:'Question'})).not.toBeDisabled());fireEvent.change(screen.getByRole('textbox'),{target:{value:'Original question'}});fireEvent.click(screen.getByRole('button',{name:'Send and ask Wishlist AI to contact the seller'}));await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Retry original operation'})).toBeEnabled();expect(screen.getByText('Saved original question')).toBeTruthy();expect(screen.getByRole('alert')).not.toHaveTextContent('private');expect(f.getActions()).toBe(1);
 });
 it('stale cleanup cannot erase or hide another tab’s newer operation',async()=>{
  const f=fixture();await enter();const key=await sourceJournalKey(API_URL,1,id);let newer='';const actualClear=vault.clear;
  const fault=vi.spyOn(privatePendingStore,'clear').mockImplementation(async(k,b)=>{await actualClear(k,b);const old=JSON.parse(b);newer=JSON.stringify({...old,payload:{...old.payload,requestId:crypto.randomUUID(),text:'另一頁的新問題'}});await vault.save(k,newer);return false});
  await send('前一份問題');expect(await vault.get(key)).toBe(newer);expect(screen.getByRole('alert')).toHaveTextContent('安全');fault.mockRestore();fireEvent.click(screen.getByRole('button',{name:'重試恢復已存操作'}));await screen.findByText('另一頁的新問題');expect(await vault.get(key)).toBe(newer);expect(f.getActions()).toBe(1);
 });
 it('logout aborts a late POST and prevents its response from revealing private history',async()=>{
  const f=fixture();let resolve!:(v:any)=>void;const original=f.fetch.getMockImplementation()!;f.fetch.mockImplementation(async(u,i)=>u.includes('/actions')&&i?.method==='POST'?new Promise(r=>{resolve=r}):original(u,i));
  const v=render(<MemoryRouter><SourceContactChat source={source()} onBack={()=>{}}/></MemoryRouter>);await waitFor(()=>expect(screen.getByRole('textbox')).not.toBeDisabled());fireEvent.change(screen.getByRole('textbox'),{target:{value:'不可洩漏的待送問題'}});fireEvent.click(screen.getByRole('button',{name:'送出並委託聯絡賣家'}));await waitFor(()=>expect(resolve).toBeDefined());const post=f.fetch.mock.calls.find(([u,i])=>u.includes('/actions')&&i?.method==='POST')!;
  auth.token=null;v.rerender(<MemoryRouter><SourceContactChat source={source()} onBack={()=>{}}/></MemoryRouter>);expect(post[1].signal.aborted).toBe(true);resolve({ok:true,status:200,json:async()=>({...emptyRoom(),events:[{requestId:JSON.parse(post[1].body).requestId,action:'ASK',text:'不可洩漏的待送問題',at:now()}]})});await waitFor(()=>expect(screen.getByRole('link',{name:'登入後聯絡賣家'})).toBeTruthy());expect(screen.queryByText('不可洩漏的待送問題')).toBeNull();expect(await vault.get(await sourceJournalKey(API_URL,1,id))).not.toBeNull();
 });
 it('the 30-second deadline releases an unresponsive local read without enabling writes',async()=>{
  const f=fixture(),timers:(()=>void)[]=[];const real=setTimeout;vi.spyOn(globalThis,'setTimeout').mockImplementation(((callback:any,ms:any,...args:any[])=>{if(ms===30000)timers.push(callback);return real(callback,ms,...args)}) as typeof setTimeout);
  const fault=vi.spyOn(privatePendingStore,'get').mockImplementation(()=>new Promise(()=>{}));render(<MemoryRouter><SourceContactChat source={source()} onBack={()=>{}}/></MemoryRouter>);expect(timers).toHaveLength(1);timers[0]();await screen.findByRole('alert');expect(screen.getByRole('textbox')).toBeDisabled();expect(screen.getByRole('button',{name:'重試恢復已存操作'})).toBeEnabled();expect(f.getActions()).toBe(0);fault.mockRestore();fireEvent.click(screen.getByRole('button',{name:'重試恢復已存操作'}));await waitFor(()=>expect(screen.getByRole('textbox')).not.toBeDisabled());
 });

});
async function enterLocked(){render(<MemoryRouter><SourceContactChat source={source()} onBack={()=>{}}/></MemoryRouter>);await waitFor(()=>expect(screen.getByRole('button',{name:'更新'})).not.toBeDisabled());await screen.findByRole('button',{name:'讀取已存詢問'});}
