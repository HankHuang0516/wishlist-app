import { act,cleanup,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { MemoryRouter,Route,Routes } from 'react-router-dom';
import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import WishlistDetail from './WishlistDetail';
const {identity,store}=vi.hoisted(()=>({identity:{user:{id:42},token:'synthetic-a'},store:{get:vi.fn(),save:vi.fn(),clear:vi.fn()}}));
vi.mock('../context/AuthContext',()=>({useAuth:()=>identity}));
vi.mock('../lib/webPendingStore',()=>({pendingRequestKey:async (_api:string,id:number,feature:string)=>`${id}.${feature}`,privatePendingStore:store}));
vi.mock('../utils/analytics',()=>({Analytics:{logViewItemList:vi.fn(),logShare:vi.fn()}}));
const item={id:4,wishlistId:1,name:'合成願望',price:null,currency:'TWD',maxPrice:750.75,priceCurrency:'TWD',isPurchased:false,isHidden:false,uploadStatus:'COMPLETED',aiStatus:'COMPLETED'};
const row={id:1,title:'合成清單',description:'原說明',userId:42,user:{id:42,name:'合成擁有者'},isPublic:true,items:[item],maxItems:100};
const response=(body:unknown,status=200)=>({ok:status>=200 && status<300,status,json:async()=>body});
const fetcher=vi.fn(),saved=new Map<string,string>();
function tree(path='/wishlists/1'){return <MemoryRouter initialEntries={[path]}><Routes><Route path="/wishlists/:id" element={<WishlistDetail/>}/><Route path="/login" element={<p>合成登入入口</p>}/></Routes></MemoryRouter>;}
const mount=(path?:string)=>render(tree(path));
async function edit(){const button=await screen.findByRole('button',{name:'編輯清單'});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);const dialog=screen.getByRole('dialog',{name:'編輯清單'});fireEvent.change(within(dialog).getByLabelText('清單名稱'),{target:{value:'編輯後清單'}});fireEvent.click(within(dialog).getByRole('button',{name:'儲存'}));return dialog;}
beforeEach(()=>{identity.user.id=42;identity.token='synthetic-a';saved.clear();window.localStorage.setItem('user-locale','zh-TW');store.get.mockReset().mockImplementation(async key=>saved.get(key)??null);store.save.mockReset().mockImplementation(async (key,raw)=>{saved.set(key,raw);});store.clear.mockReset().mockImplementation(async (key,raw)=>{if(saved.get(key)!==raw)return false;saved.delete(key);return true;});fetcher.mockReset().mockImplementation(async ()=>response(row));vi.stubGlobal('fetch',fetcher);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('legacy detail list and gift contracts',()=>{
  it('merges the itemless edit ACK and preserves child wishes and budget',async()=>{
    fetcher.mockImplementation(async (_url,init)=>response(init?.method==='PUT'?{id:1,userId:42,...JSON.parse(init.body)}:row));mount();await edit();await screen.findByRole('heading',{name:'編輯後清單'});
    expect(screen.getByText('合成願望')).toBeInTheDocument();expect(screen.getByText(/最高預算:/)).toHaveTextContent('750.75');expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(saved.size).toBe(0);
    const write=fetcher.mock.calls.find(call=>call[1]?.method==='PUT')!;expect(write[0]).toMatch(/\/wishlists\/1$/);expect(write[1]).toMatchObject({cache:'no-store',redirect:'error'});
    fireEvent.click(screen.getByRole('button',{name:'編輯清單'}));expect(screen.getByLabelText('清單名稱')).toHaveValue('編輯後清單');
  });
  it.each([{id:2,userId:42,title:'編輯後清單',description:'原說明',isPublic:true},{id:1,userId:43,title:'編輯後清單',description:'原說明',isPublic:true},{id:1,userId:42,title:'舊值',description:'原說明',isPublic:true},{id:1,userId:42,title:'編輯後清單',description:'舊說明',isPublic:true}])('retains the original list and marker for mismatched edit ACK %#',async ack=>{
    fetcher.mockImplementation(async (_url,init)=>response(init?.method==='PUT'?ack:row));mount();await edit();await screen.findAllByText(/結果尚未確認/);expect(screen.getByRole('heading',{name:'合成清單'})).toBeInTheDocument();expect(screen.queryByText('已儲存')).not.toBeInTheDocument();expect(saved.size).toBe(1);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'儲存'}));expect(fetcher.mock.calls.filter(c=>c[1]?.method==='PUT')).toHaveLength(1);
  });
  it('uses the public minimal purchase ACK and isPurchased independently of completed AI',async()=>{
    identity.user.id=7;fetcher.mockImplementation(async (url,init)=>response(init?.method==='PUT'?{id:4,isPurchased:JSON.parse(init.body).isPurchased}:row));mount();const button=await screen.findByRole('button',{name:'標記已送禮 合成願望'});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);
    await screen.findByRole('button',{name:'取消送禮標記 合成願望'});const write=fetcher.mock.calls.find(c=>c[1]?.method==='PUT')!;expect(write[0]).toMatch(/\/items\/4$/);expect(JSON.parse(write[1].body)).toEqual({isPurchased:true});expect(store.save.mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[1]);
    fireEvent.click(screen.getByRole('button',{name:'取消送禮標記 合成願望'}));await screen.findByRole('button',{name:'標記已送禮 合成願望'});expect(JSON.parse(fetcher.mock.calls.filter(c=>c[1]?.method==='PUT')[1][1].body)).toEqual({isPurchased:false});
  });
  it.each([{id:5,isPurchased:true},{id:4,isPurchased:false}])('does not mark a gift confirmed for a mismatched minimal ACK %#',async ack=>{
    identity.user.id=7;fetcher.mockImplementation(async (_url,init)=>response(init?.method==='PUT'?ack:row));mount();const button=await screen.findByRole('button',{name:'標記已送禮 合成願望'});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);await screen.findByText(/結果尚未確認/);expect(screen.getByRole('button',{name:'標記已送禮 合成願望'})).toBeDisabled();expect(screen.queryByRole('button',{name:'取消送禮標記 合成願望'})).not.toBeInTheDocument();expect(saved.size).toBe(1);
  });
  it('accepts a public SELECT without private processing fields or userId and exposes no owner controls',async()=>{
    identity.user.id=7;const {userId,maxItems,...publicRow}=row;const {uploadStatus,aiStatus,isHidden,...publicItem}=item;fetcher.mockResolvedValue(response({...publicRow,items:[publicItem]}));mount();await screen.findByText('合成願望');expect(screen.queryByRole('button',{name:'編輯清單'})).not.toBeInTheDocument();expect(screen.queryByText(/Uploading/)).not.toBeInTheDocument();expect(screen.getByText('1/尚未確認')).toBeInTheDocument();expect(screen.getByRole('button',{name:'標記已送禮 合成願望'})).toBeInTheDocument();
  });
  it('preserves the original blocked-source alternative without displaying provider diagnostics',async()=>{
    fetcher.mockResolvedValue(response({...row,items:[{...item,aiStatus:'FAILED',aiError:'403 synthetic-private-provider-diagnostic'}]}));mount();fireEvent.click(await screen.findByRole('button',{name:'查看願望 合成願望'}));await screen.findByText('AI 無法存取此網頁 (反爬蟲阻擋)');expect(screen.getByText(/建議您截圖商品圖片/)).toBeInTheDocument();expect(screen.queryByText(/synthetic-private-provider-diagnostic/)).not.toBeInTheDocument();
  });
  it('keeps unknown purchase locked across reload and only reads on explicit recovery',async()=>{
    identity.user.id=7;fetcher.mockImplementation(async (_url,init)=>response(init?.method==='PUT'?{}:row,init?.method==='PUT'?502:200));const view=mount();const button=await screen.findByRole('button',{name:'標記已送禮 合成願望'});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);await screen.findByText(/結果尚未確認/);view.unmount();mount();await screen.findByText(/原清單操作結果待確認/);
    expect(screen.getByRole('button',{name:'標記已送禮 合成願望'})).toBeDisabled();expect(fetcher.mock.calls.filter(c=>c[1]?.method==='PUT')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'讀取目前清單狀態'}));await screen.findByText(/這不是原操作的歷史回執/);expect(saved.size).toBe(1);fireEvent.click(screen.getByRole('button',{name:'已讀目前狀態，清理標記並恢復操作'}));await waitFor(()=>expect(saved.size).toBe(0));expect(fetcher.mock.calls.filter(c=>c[1]?.method==='PUT')).toHaveLength(1);
  });
  it('synchronously gates repeated clicks and holds the edit dialog during the request',async()=>{
    let finish!:(value:unknown)=>void;fetcher.mockImplementation((_url,init)=>init?.method==='PUT'?new Promise(resolve=>{finish=resolve;}):Promise.resolve(response(row)));mount();const dialog=await edit();await waitFor(()=>expect(finish).toBeDefined());fireEvent.click(within(dialog).getByRole('button',{name:'儲存'}));fireEvent.keyDown(dialog,{key:'Escape'});expect(dialog).toBeInTheDocument();expect(within(dialog).getByRole('button',{name:'關閉'})).toBeDisabled();expect(fetcher.mock.calls.filter(c=>c[1]?.method==='PUT')).toHaveLength(1);await act(async()=>finish(response({id:1,userId:42,title:'編輯後清單',description:'原說明',isPublic:true})));
  });
  it('blocks dispatch when encrypted storage fails',async()=>{
    store.save.mockRejectedValue(new Error('synthetic storage failure'));mount();await edit();await screen.findAllByText(/未送出新操作/);expect(fetcher.mock.calls.filter(c=>c[1]?.method==='PUT')).toHaveLength(0);
  });
  it('keeps confirmed changes when local cleanup fails and retries cleanup only',async()=>{
    store.clear.mockRejectedValue(new Error('synthetic cleanup failure'));fetcher.mockImplementation(async (_url,init)=>response(init?.method==='PUT'?{id:1,userId:42,...JSON.parse(init.body)}:row));mount();await edit();await screen.findByRole('heading',{name:'編輯後清單'});await screen.findByText(/後台已確認操作，但本機標記未清理/);store.clear.mockImplementation(async (key)=>{saved.delete(key);return true;});fireEvent.click(screen.getByRole('button',{name:'清理已確認操作的本機標記'}));await waitFor(()=>expect(saved.size).toBe(0));expect(fetcher.mock.calls.filter(c=>c[1]?.method==='PUT')).toHaveLength(1);
  });
  it('ignores late replies and preserves the original account marker after an account switch',async()=>{
    let finish!:(value:unknown)=>void;fetcher.mockImplementation((_url,init)=>init?.method==='PUT'?new Promise(resolve=>{finish=resolve;}):Promise.resolve(response(row)));const view=mount();await edit();await waitFor(()=>expect(finish).toBeDefined());identity.user.id=7;identity.token='synthetic-b';view.rerender(tree());await screen.findByRole('button',{name:'標記已送禮 合成願望'});await act(async()=>finish(response({id:1,userId:42,title:'編輯後清單',description:'原說明',isPublic:true})));expect(screen.queryByRole('heading',{name:'編輯後清單'})).not.toBeInTheDocument();expect(saved.has('42.legacy-detail-operation')).toBe(true);expect(store.clear).not.toHaveBeenCalled();
  });
  it('handles purchase conflict explicitly without exposing raw service text',async()=>{
    identity.user.id=7;fetcher.mockImplementation(async (_url,init)=>response(init?.method==='PUT'?{error:'synthetic-private-diagnostic'}:row,init?.method==='PUT'?409:200));mount();const button=await screen.findByRole('button',{name:'標記已送禮 合成願望'});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);await screen.findByText(/操作被拒絕/);expect(screen.queryByText(/synthetic-private-diagnostic/)).not.toBeInTheDocument();expect(saved.size).toBe(0);
  });
  it('updates hide only on an exact item and boolean acknowledgment',async()=>{
    fetcher.mockImplementation(async (_url,init)=>response(init?.method==='PUT'?{id:4,isHidden:true}:row));mount();const button=await screen.findByRole('button',{name:'隱藏願望 合成願望'});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);await screen.findByRole('button',{name:'顯示願望 合成願望'});expect(JSON.parse(fetcher.mock.calls.find(c=>c[1]?.method==='PUT')![1].body)).toEqual({isHidden:true});
  });
  it.each([{}, {...row,id:2},{...row,items:null},{...row,items:[item,item]}])('rejects malformed reads and provides retry instead of a false missing state %#',async body=>{
    fetcher.mockResolvedValue(response(body));mount();await screen.findByText('尚未確認目前清單；請重試讀取。');expect(screen.queryByText('目前找不到此清單。')).not.toBeInTheDocument();fetcher.mockResolvedValue(response(row));fireEvent.click(screen.getByRole('button',{name:'重新讀取清單'}));await screen.findByText('合成清單');
  });
  it('retains a different list marker and provides navigation to its original list',async()=>{
    saved.set('42.legacy-detail-operation',JSON.stringify({version:1,id:9,kind:'HIDE',itemId:10,wanted:true,localOperationId:'11111111-1111-4111-8111-111111111111'}));mount();await screen.findByRole('link',{name:'開啟原操作清單'});expect(screen.getByRole('link',{name:'開啟原操作清單'})).toHaveAttribute('href','/wishlists/9');expect(screen.getByRole('button',{name:'編輯清單'})).toBeDisabled();
  });
  it('retains the pending marker when the explicit current-state read fails',async()=>{
    const marker=JSON.stringify({version:1,id:1,kind:'HIDE',itemId:4,wanted:true,localOperationId:'11111111-1111-4111-8111-111111111111'});saved.set('42.legacy-detail-operation',marker);mount();await screen.findByRole('button',{name:'讀取目前清單狀態'});fetcher.mockResolvedValue(response({},503));fireEvent.click(screen.getByRole('button',{name:'讀取目前清單狀態'}));await screen.findByText('目前狀態仍未確認，原標記保留。');expect(screen.getByRole('button',{name:'已讀目前狀態，清理標記並恢復操作'})).toBeDisabled();expect(saved.get('42.legacy-detail-operation')).toBe(marker);expect(store.clear).not.toHaveBeenCalled();
  });
  it('blocks new operations when an existing marker cannot be parsed',async()=>{
    saved.set('42.legacy-detail-operation','invalid-synthetic-journal');mount();await screen.findByText(/無法安全恢復或保存/);expect(screen.getByRole('button',{name:'編輯清單'})).toBeDisabled();expect(screen.getByRole('button',{name:'隱藏願望 合成願望'})).toBeDisabled();expect(fetcher.mock.calls.filter(c=>c[1]?.method==='PUT')).toHaveLength(0);
  });
  it('renders English recovery and skips invalid IDs without network access',()=>{
    window.localStorage.setItem('user-locale','en-US');mount('/wishlists/0');expect(screen.getByRole('alert')).toHaveTextContent('Invalid list ID.');expect(fetcher).not.toHaveBeenCalled();
  });
});
