import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import SourceContactChat from './SourceContactChat';
import ExplorePage from '../pages/ExplorePage';
import ChatPage from '../pages/ChatPage';
const auth=vi.hoisted(()=>({token:'synthetic-token' as string|null,user:{id:1}}));
vi.mock('../context/AuthContext',()=>({useAuth:()=>auth}));
vi.mock('./ExploreMapWeb',()=>({default:(props:any)=><div data-testid="original-map"><output>{props.sourceLeads?.length}</output><output data-testid="source-map-frame">{JSON.stringify(props.frame)}</output><button onClick={()=>props.onCluster('source',props.sourceLeads.map((r:any)=>r.id))}>來源群聚</button></div>}));
const id='d897f4d9-1e66-4a0d-bd3f-1861f0e6cb46',roomId='9269fe36-ff74-4f18-a87c-f56cb826b240';
const now=()=>new Date().toISOString();
const source=()=>({id,kind:'SOURCE_LEAD',title:'合成測試來源商品',summary:'僅供本地測試',canonicalUrl:'https://example.invalid/source/one',county:'臺南市',district:'永康區',publicPlaceName:'公共面交點',publicAddress:'公開地點',latitude:23,longitude:120.2,postedEarliestAt:now(),postedLatestAt:now(),checkedAt:now(),stockStatus:'UNKNOWN',qualifiedSupply:false,checkoutEnabled:false,notice:'待確認',publicFacts:null,coordinateSourceUrl:'https://www.openstreetmap.org/node/1',coordinateAttribution:null,media:[]});
const emptyRoom=()=>({id:roomId,leadId:id,available:true,state:'INQUIRY',transferHash:'a'.repeat(64),events:[] as any[],routeVerified:false,delivered:false,delivery:null,checkoutEnabled:false,orderCreated:false,notice:'不下訂'});
afterEach(()=>{auth.token='synthetic-token';sessionStorage.clear();cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()});
function fixture({unknown=false,reject=false,wrong=false}: {unknown?:boolean;reject?:boolean;wrong?:boolean}={}) {
 let room:any=null;let actions=0;
 const fetch=vi.fn(async(url:string,init:any)=>{
  const path=new URL(url,'https://example.invalid').pathname;
  const ok=(value:any)=>({ok:true,status:200,json:async()=>value});
  if(path.endsWith('/inquiries/mine'))return ok({items:room?[{id:room.id,state:room.state,context:source()}]:[],nextCursor:null});
  if(path.endsWith('/source-leads'))return ok({enabled:true,items:[source()],nextCursor:null});
  if(path.endsWith('/inquiry')){if(init?.method==='POST'&&!room)room=emptyRoom();return ok(wrong?{...emptyRoom(),leadId:'aaaabbbb-cccc-4ddd-8eee-123456789012'}:room);}
  if(path.endsWith('/actions')){actions++;const b=JSON.parse(init.body);if(reject&&b.action==='ASK')return{ok:false,status:409};room={...room,state:b.action==='CANCEL'?'CANCELLED':'WAITING_ROUTE',transferHash:'b'.repeat(64),events:[...room.events,{...b,at:now()}]};if(unknown&&actions===1)throw Error('unknown after save');return ok(room);}
  if(path.endsWith('/source-leads/'+id))return ok(source());
  if(path.includes('external-listings'))return ok({enabled:false,items:[],nextCursor:null});
  return ok({items:[],nextCursor:null});
 });vi.stubGlobal('fetch',fetch);return{fetch,getRoom:()=>room,getActions:()=>actions,setRoom:(r:any)=>room=r};
}
async function enter() {const onBack=vi.fn();render(<MemoryRouter><SourceContactChat source={source()} onBack={onBack}/></MemoryRouter>);await waitFor(()=>expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false));return onBack;}
async function send(text='請確認現貨'){fireEvent.change(screen.getByRole('textbox'),{target:{value:text}});fireEvent.click(screen.getByRole('button',{name:'送出並委託聯絡賣家'}));}
describe('source contact inside the original Explore and Chat',()=>{
 it('original card → detail → original chat → one explicit send → same source on return',async()=>{const f=fixture();render(<MemoryRouter initialEntries={['/explore']}><Routes><Route path="/explore" element={<ExplorePage/>}/><Route path="/chat" element={<ChatPage/>}/></Routes></MemoryRouter>);fireEvent.click(await screen.findByRole('button',{name:'查看合成測試來源商品商品詳情'}));await screen.findByRole('dialog',{name:'外部來源商品'});fireEvent.click(screen.getByRole('link',{name:/聯絡賣家/}));await screen.findByRole('dialog',{name:'Wishlist AI 聊聊'});await waitFor(()=>expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false));expect(screen.queryByRole('checkbox')).toBeNull();await send();await screen.findByText(/已接至 Wishlist AI 收件/);expect(f.getActions()).toBe(1);fireEvent.click(screen.getByRole('button',{name:'返回商品'}));const returned=await screen.findByRole('dialog',{name:'外部來源商品'});expect(returned).toHaveTextContent('合成測試來源商品');expect(f.getActions()).toBe(1);});
 it('opening only reads; a single send carries item-bounded consent and no fake delivery',async()=>{const f=fixture();await enter();expect(f.fetch.mock.calls.filter(([u,i])=>u.includes('/inquiry')&&i?.method==='POST')).toHaveLength(0);expect(screen.getByText(/商品ID：/)).toHaveTextContent(id);await send();await screen.findByText(/已接至 Wishlist AI 收件/);const body=JSON.parse(f.fetch.mock.calls.find(([u])=>u.includes('/actions'))![1].body);expect(body).toMatchObject({action:'ASK',text:'請確認現貨',consent:true,transferHash:'a'.repeat(64)});expect(screen.getByText(/尚未送給賣家/)).toBeTruthy();expect(screen.queryByRole('checkbox')).toBeNull();});
 it('purchase intention remains an editable draft, not an order or automatic send',async()=>{const f=fixture();await enter();fireEvent.click(screen.getByRole('button',{name:'我想購買，先代問現貨與條件'}));expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('購買意願');expect(f.getActions()).toBe(0);expect(screen.getByText(/不會下訂或付款/)).toBeTruthy();});
 it('unknown send recovers original receipt by GET without a replacement send',async()=>{const f=fixture({unknown:true});await enter();await send('請問價格');await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'更新'}));await screen.findByText('請問價格');expect(f.getActions()).toBe(1);expect(sessionStorage.getItem('source-lead-request:1:'+id)).toBeNull();});
 it('cancels only the existing item thread',async()=>{const f=fixture();await enter();await send('詢問尺寸');await screen.findByText('詢問尺寸');fireEvent.click(screen.getByRole('button',{name:'撤回委託'}));await screen.findByText('後續代問已取消。');expect(f.getActions()).toBe(2);});
 it('definite rejection clears journal and never claims delivery',async()=>{const f=fixture({reject:true});await enter();await send('問題');await screen.findByRole('alert');expect(sessionStorage.getItem('source-lead-request:1:'+id)).toBeNull();expect(screen.queryByText(/已人工轉交/)).toBeNull();});
 it('rejects a room bound to another product',async()=>{const f=fixture({wrong:true});await enter();await screen.findByRole('alert');expect(f.getActions()).toBe(0);expect(screen.queryByText(/詢問編號/)).toBeNull();});
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

});
