import { act,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ListingBatchPage from './ListingBatchPage';
import { AuthContext } from '../context/AuthContext';
import { privatePendingStore,pendingRequestKey } from '../lib/webPendingStore';
import { API_URL } from '../config';
import { parseSellerDraftJournal } from '../lib/sellerDraftWeb';
import { emptyListingDraft } from '../lib/listingBatch';
const records=vi.hoisted(()=>new Map<string,string>());
vi.mock('../lib/webPendingStore',async original=>({...await original<typeof import('../lib/webPendingStore')>(),privatePendingStore:{
 get:vi.fn(async(key:string)=>records.get(key)??null),
 save:vi.fn(async(key:string,body:string)=>{if(records.has(key)&&records.get(key)!==body)throw Error('CAS');records.set(key,body);}),
 clear:vi.fn(async(key:string,body:string)=>records.get(key)===body?records.delete(key):false),
 replaceDraft:vi.fn(async(key:string,expected:string|null,body:string)=>{if((records.get(key)??null)!==expected)throw Error('CAS');records.set(key,body);}),
 clearComposerDraft:vi.fn(async(key:string,body:string)=>records.get(key)===body?records.delete(key):false),
 composerDraftKeys:vi.fn(async(scope:string)=>[...records.keys()].filter(key=>key.startsWith(scope+'.listing-compose.'))),
}}));
const id='11111111-1111-4111-8111-111111111111',clientListingId='22222222-2222-4222-8222-222222222222';
const initial={clientListingId,form:{...emptyListingDraft(),title:'後台原名',description:'後台原說明',price:'320'},touched:{title:true,description:true,price:true} as const};
const auth={user:{id:19,phoneNumber:'synthetic'},token:'session',login:vi.fn(),logout:vi.fn(),refreshUser:vi.fn(),isAuthenticated:true};
const view=(value=auth)=><MemoryRouter><AuthContext.Provider value={value}><ListingBatchPage/></AuthContext.Provider></MemoryRouter>;
const ok=(value:unknown)=>({ok:true,status:200,json:async()=>value,blob:async()=>new Blob(['synthetic'],{type:'image/webp'})});
let serverDraft=structuredClone(initial),version=0,available=true,hold=false,release:(()=>void)|undefined;
const calls:{path:string;method:string}[]=[];
beforeEach(()=>{records.clear();calls.length=0;serverDraft=structuredClone(initial);version=0;available=true;hold=false;release=undefined;localStorage.clear();vi.spyOn(window,'confirm').mockReturnValue(true);URL.createObjectURL=vi.fn(()=>'blob:synthetic');URL.revokeObjectURL=vi.fn();
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const path=String(input),method=init?.method??'GET';calls.push({path,method});
  const other=(init?.headers as Record<string,string>)?.Authorization==='Bearer other';
  const media=()=>({id,ownerUserId:19,listingId:null,wishItemId:null,capturePurpose:'BATCH_ITEM',sellerDraft:serverDraft,sellerDraftVersion:version});
  if(path.includes('/unused?purpose='))return ok({items:available&&!other?[{...media(),aiDraftStatus:'SKIPPED',aiDraft:null}]:[],nextCursor:null});
  if(path.endsWith('/ai-availability'))return ok({available:false});
  if(path.includes('/seller-draft-operations/')&&method==='POST'){
   const raw=[...records.values()].find(raw=>raw.includes('expectedVersion')&&raw.includes('requestHash'))!,journal=await parseSellerDraftJournal(raw);serverDraft=journal.draft as typeof initial;version++;
   if(hold)await new Promise<void>(resolve=>{release=resolve;});
   return ok({receipt:{clientActionId:journal.clientActionId,mediaId:id,requestHash:journal.requestHash,state:'APPLIED',appliedVersion:version,createdAt:'2026-10-02T00:00:00.000Z'},media:media()});
  }
  return ok({});
 }));
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const persisted=async(text:string)=>waitFor(()=>expect([...records.entries()].some(([key,raw])=>key.includes('.listing-compose.')&&raw.includes(text))).toBe(true));
describe('listing composer local drafts in real page flows',()=>{
 it('reload restores text typed before blur, including unfinished price, without POST',async()=>{
  const mounted=render(view());const title=await screen.findByLabelText('商品名稱');fireEvent.change(title,{target:{value:'尚未失焦的私人文字'}});fireEvent.change(screen.getByLabelText('商品說明'),{target:{value:'第一行\n第二行尚未送出'}});fireEvent.change(screen.getByLabelText('賣家售價（TWD）'),{target:{value:'1.'}});await persisted('第二行尚未送出');
  mounted.unmount();render(view());await screen.findByDisplayValue('尚未失焦的私人文字');expect(screen.getByLabelText('商品說明')).toHaveValue('第一行\n第二行尚未送出');expect(screen.getByLabelText('賣家售價（TWD）')).toHaveValue('1.');expect(calls.every(call=>call.method==='GET')).toBe(true);
 });
 it('reload restores common settings and approximate location, resetting both publication confirmations',async()=>{
  const mounted=render(view());await screen.findByLabelText('商品名稱');fireEvent.change(screen.getByLabelText('縣市'),{target:{value:'臺北市'}});fireEvent.change(screen.getByLabelText('行政區'),{target:{value:'中山區'}});fireEvent.change(screen.getByLabelText('緯度（度）'),{target:{value:'25.051234'}});fireEvent.change(screen.getByLabelText('經度（度）'),{target:{value:'121.521234'}});fireEvent.click(screen.getByLabelText('寄送'));fireEvent.change(screen.getByLabelText(/自訂失效日期/,{selector:"input"}),{target:{value:'2100-01-02'}});fireEvent.click(screen.getByLabelText(/我已確認商品真實/));fireEvent.click(screen.getByLabelText(/我已逐欄確認/));
  await waitFor(()=>expect([...records.values()].some(raw=>raw.includes('2100-01-02'))).toBe(true));mounted.unmount();render(view());await screen.findByDisplayValue('臺北市');expect(screen.getByLabelText('行政區')).toHaveValue('中山區');expect(screen.getByLabelText('緯度（度）')).toHaveValue('25.05');expect(screen.getByLabelText('經度（度）')).toHaveValue('121.53');expect(screen.getByLabelText('寄送')).toBeChecked();expect(screen.getByLabelText(/自訂失效日期/,{selector:"input"})).toHaveValue('2100-01-02');expect(screen.getByLabelText(/我已確認商品真實/)).not.toBeChecked();expect(screen.getByLabelText(/我已逐欄確認/)).not.toBeChecked();expect(calls.every(call=>call.method==='GET')).toBe(true);
 });
 it('server version changes require explicit comparison; keeping local text makes no POST',async()=>{
  const mounted=render(view());fireEvent.change(await screen.findByLabelText('商品名稱'),{target:{value:'本機要保留'}});await persisted('本機要保留');mounted.unmount();version=2;serverDraft={...initial,form:{...initial.form,title:'另一裝置新版',price:'420'}};render(view());await screen.findByText('後台目前名稱：另一裝置新版');expect(screen.getByLabelText('商品名稱')).toHaveValue('本機要保留');expect(screen.getByText('儲存私人草稿')).toBeDisabled();fireEvent.click(screen.getByText('保留本機文字，採用目前版本'));await screen.findByText('已保留本機修改並採用目前版本；沒有送出，請逐欄核對後再儲存。');expect(calls.every(call=>call.method==='GET')).toBe(true);expect(screen.getByLabelText('商品名稱')).toHaveValue('本機要保留');
 });
 it('adopting the server draft replaces local fields without a write to server',async()=>{
  const mounted=render(view());fireEvent.change(await screen.findByLabelText('商品名稱'),{target:{value:'舊本機文字'}});await persisted('舊本機文字');mounted.unmount();version=1;serverDraft={...initial,form:{...initial.form,title:'採用後台新版'}};render(view());await screen.findByText('後台目前名稱：採用後台新版');fireEvent.click(screen.getByText('採用後台目前草稿'));await screen.findByText('已採用後台目前草稿；沒有送出保存或刊登。');expect(screen.getByLabelText('商品名稱')).toHaveValue('採用後台新版');expect(calls.every(call=>call.method==='GET')).toBe(true);
 });
 it('a moved or deleted photo keeps text readonly and cannot be saved, published or recreated',async()=>{
  const mounted=render(view());fireEvent.change(await screen.findByLabelText('商品名稱'),{target:{value:'照片不見但文字要保留'}});await persisted('照片不見但文字要保留');mounted.unmount();available=false;render(view());const title=await screen.findByDisplayValue('照片不見但文字要保留');expect(title).toHaveAttribute('readonly');expect(screen.getByText('儲存私人草稿')).toBeDisabled();expect(screen.getByText('確認並刊登')).toBeDisabled();expect(screen.queryByRole('img',{name:'僅本人可見的商品照片'})).toBeNull();expect(screen.getByText(/此照片已不在可編輯/)).toBeInTheDocument();expect(calls.every(call=>call.method==='GET')).toBe(true);
 });
 it('storage failure keeps visible text readonly and prevents the server save',async()=>{
  render(view());const title=await screen.findByLabelText('商品名稱');await waitFor(()=>expect([...records.keys()].some(key=>key.endsWith('.listing-compose-details'))).toBe(true));vi.mocked(privatePendingStore.replaceDraft).mockRejectedValueOnce(Error('quota'));fireEvent.change(title,{target:{value:'尚未落盤，供複製'}});await screen.findByText(/本機草稿保存失敗或已由另一分頁更新/);expect(title).toHaveValue('尚未落盤，供複製');expect(title).toHaveAttribute('readonly');expect(screen.getByText('儲存私人草稿')).toBeDisabled();expect(calls.every(call=>call.method==='GET')).toBe(true);
 });
 it('two tabs keep the older page text without overwriting the newer stored draft',async()=>{
  const a=render(view());await within(a.container).findByLabelText('商品名稱');const b=render(view());await within(b.container).findByLabelText('商品名稱');fireEvent.change(within(a.container).getByLabelText('商品名稱'),{target:{value:'第一頁較新文字'}});await persisted('第一頁較新文字');fireEvent.change(within(b.container).getByLabelText('商品名稱'),{target:{value:'第二頁自己的文字'}});await within(b.container).findByText(/本機草稿保存失敗或已由另一分頁更新/);expect(within(b.container).getByLabelText('商品名稱')).toHaveValue('第二頁自己的文字');expect([...records.values()].some(raw=>raw.includes('第二頁自己的文字'))).toBe(false);expect(calls.every(call=>call.method==='GET')).toBe(true);
 });
 it('server ACK cannot erase text edited while the request was in flight, even after reload',async()=>{
  hold=true;const mounted=render(view());fireEvent.change(await screen.findByLabelText('商品名稱'),{target:{value:'送出時原內容'}});await persisted('送出時原內容');fireEvent.click(screen.getByText('儲存私人草稿'));await waitFor(()=>expect(release).toBeTypeOf('function'));fireEvent.change(screen.getByLabelText('商品名稱'),{target:{value:'送出期間的新文字'}});await persisted('送出期間的新文字');await act(async()=>release!());await screen.findByText(/私人草稿已確認儲存/);mounted.unmount();render(view());await screen.findByDisplayValue('送出期間的新文字');expect(screen.queryByText('保留本機文字，採用目前版本')).toBeNull();expect(serverDraft.form.title).toBe('送出時原內容');expect(calls.filter(call=>call.method==='POST')).toHaveLength(1);
 });
 it('corrupt local storage fails before private inventory or any server mutation',async()=>{
  records.set(await pendingRequestKey(API_URL,19,'listing-compose-details'),'{bad');render(view());await screen.findByText(/此瀏覽器無法讀取安全刊登紀錄/);expect(calls).toHaveLength(0);
 });
 it('a proven server save remains confirmed when the local baseline write fails',async()=>{
  render(view());fireEvent.change(await screen.findByLabelText('商品名稱'),{target:{value:'後台已確認的原內容'}});await persisted('後台已確認的原內容');
  vi.mocked(privatePendingStore.replaceDraft).mockRejectedValueOnce(Error('quota after ACK'));
  fireEvent.click(screen.getByText('儲存私人草稿'));
  await screen.findByText('後台原草稿結果已確認，但本機文字尚未安全保存；請先複製並重讀本機草稿，沒有再次送出。');
  expect(serverDraft.form.title).toBe('後台已確認的原內容');expect(calls.filter(call=>call.method==='POST')).toHaveLength(1);
  expect(screen.getByLabelText('商品名稱')).toHaveValue('後台已確認的原內容');expect(screen.getByLabelText('商品名稱')).toHaveAttribute('readonly');
  expect([...records.keys()].some(key=>key.endsWith('.listing-draft'))).toBe(true);
  expect(screen.queryByText('原草稿儲存結果待確認；先查核，不要改送另一份內容。')).toBeNull();
 });
 it('switching accounts cannot expose the previous account local form or common settings',async()=>{
  const mounted=render(view());fireEvent.change(await screen.findByLabelText('商品名稱'),{target:{value:'賣家私人未送文字'}});fireEvent.change(screen.getByLabelText('縣市'),{target:{value:'臺北市'}});await persisted('賣家私人未送文字');mounted.rerender(view({...auth,user:{id:20,phoneNumber:'other'},token:'other'}));await screen.findByText('還沒有私人商品照片，現在就拍第一件吧。');expect(screen.queryByDisplayValue('賣家私人未送文字')).toBeNull();mounted.rerender(view());await screen.findByDisplayValue('賣家私人未送文字');expect(screen.getByLabelText('縣市')).toHaveValue('臺北市');expect(calls.every(call=>call.method==='GET')).toBe(true);
 });
});
