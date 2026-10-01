import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ListingBatchPage from './ListingBatchPage';
import { photoRemovalJournal, parsePhotoRemovalJournal } from '../lib/privatePhotoRemovalWeb';
import { privatePendingStore, pendingRequestKey } from '../lib/webPendingStore';
import { API_URL } from '../config';
const pending=vi.hoisted(()=>new Map<string,string>());
vi.mock('../lib/webPendingStore',async importOriginal=>({...await importOriginal<typeof import('../lib/webPendingStore')>(),privatePendingStore:{get:vi.fn(async(key:string)=>pending.get(key)??null),save:vi.fn(async(key:string,body:string)=>{if(pending.has(key)&&pending.get(key)!==body)throw Error();pending.set(key,body);}),clear:vi.fn(async(key:string,body:string)=>{if(pending.get(key)!==body)return false;pending.delete(key);return true;})}}));
const mediaId='11111111-1111-4111-8111-111111111111',clientListingId='22222222-2222-4222-8222-222222222222';
const form={title:'原始私人商品',description:'原始私人說明',brand:'',category:'home',condition:'USED',price:'320'};
const draft={clientListingId,form,touched:{title:true,description:true,price:true}};
const auth={user:{id:19,phoneNumber:'synthetic'},token:'session',login:vi.fn(),logout:vi.fn(),refreshUser:vi.fn(),isAuthenticated:true};
const view=(value=auth)=><MemoryRouter><AuthContext.Provider value={value}><ListingBatchPage/></AuthContext.Provider></MemoryRouter>;
const ok=(value:unknown)=>({ok:true,status:200,json:async()=>value,blob:async()=>new Blob(['synthetic'],{type:'image/webp'})});
let exists=true,loseAck=false,version=0,conflict=false,rejectGet=false,rejectRemovedInventory=false,hold=false,release:(()=>void)|undefined;
const calls:{path:string;method:string;body?:string}[]=[],receipts=new Map<string,any>();
beforeEach(()=>{
  exists=true;loseAck=false;version=0;conflict=false;rejectGet=false;rejectRemovedInventory=false;hold=false;release=undefined;pending.clear();receipts.clear();calls.length=0;localStorage.clear();vi.spyOn(window,'confirm').mockReturnValue(true);URL.createObjectURL=vi.fn(()=>'blob:synthetic');URL.revokeObjectURL=vi.fn();
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const path=String(input),method=init?.method??'GET';calls.push({path,method,body:typeof init?.body==='string'?init.body:undefined});
    const other=(init?.headers as Record<string,string>)?.Authorization==='Bearer other-session';
    const media={id:mediaId,ownerUserId:19,listingId:null,wishItemId:null,capturePurpose:'BATCH_ITEM',sellerDraft:draft,sellerDraftVersion:version};
    if(path.includes('/unused?purpose=')){if(!exists&&rejectRemovedInventory)throw Error('inventory unavailable');return ok({items:exists&&!other?[{...media,aiDraftStatus:'SKIPPED',aiDraft:null}]:[],nextCursor:null});}
    if(path.endsWith('/ai-availability'))return ok({available:false});
    if(path.includes('/photo-removals/')){
      const action=path.split('/photo-removals/')[1].split('/')[0];
      if(method==='GET'){if(rejectGet)throw Error('GET unavailable');if(!receipts.has(action))return{ok:false,status:404,json:async()=>({})};return ok(receipts.get(action));}
      const raw=[...pending.values()].find(value=>value.includes(action))!,journal=await parsePhotoRemovalJournal(raw);
      let result=receipts.get(action);
      if(!result){const state=path.endsWith('/abandon')?'ABANDONED':conflict?'CONFLICT':'REMOVED';result={receipt:{clientActionId:action,requestHash:journal.requestHash,state,mediaId:state==='ABANDONED'?null:mediaId,expectedVersion:state==='ABANDONED'?null:journal.expectedVersion,createdAt:'2026-10-02T00:00:00.000Z'},media:state==='CONFLICT'?{...media,sellerDraft:{...draft,form:{...form,title:'另一分頁新草稿',price:'420'}},sellerDraftVersion:version}:null,cleanupPending:state==='REMOVED'};receipts.set(action,result);if(state==='REMOVED')exists=false;}
      if(hold)await new Promise<void>(resolve=>{release=resolve;});
      if(loseAck&&!path.endsWith('/abandon'))throw Error('lost ACK');return ok(result);
    }
    if(path.endsWith('/seller-draft'))throw Error('unexpected save');
    return ok({});
  }));
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
const remove=async()=>{const button=await screen.findByLabelText('刪除第 1 件私人照片');await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);};
describe('private photo removal original-operation recovery',()=>{
  it('lost ACK reload reads one original receipt without another POST or legacy DELETE',async()=>{
    loseAck=true;const mounted=render(view());await remove();await screen.findByText(/私人照片移除結果尚未確認/);expect(screen.getByLabelText('拍一件商品')).toBeDisabled();
    const raw=[...pending.values()][0];expect((await parsePhotoRemovalJournal(raw)).mediaId).toBe(mediaId);mounted.unmount();render(view());
    await screen.findByText('私人照片與草稿已從使用清單移除；檔案清理仍待後台完成。');expect(pending.size).toBe(0);expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);expect(calls.some(c=>c.method==='DELETE')).toBe(false);
  });
  it('failed storage prevents removal and no automatic retry happens after recovery',async()=>{
    render(view());await screen.findByDisplayValue('原始私人商品');vi.mocked(privatePendingStore.save).mockRejectedValueOnce(Error('quota'));await remove();await screen.findByText(/尚未送出移除/);expect(calls.every(c=>c.method==='GET')).toBe(true);expect(exists).toBe(true);
  });
  it('newer draft conflict survives reload; explicit comparison closes without deleting and retains local text',async()=>{
    conflict=true;version=1;render(view());const title=await screen.findByLabelText('商品名稱');fireEvent.change(title,{target:{value:'保留未送出文字'}});await remove();await screen.findByText('目前名稱：另一分頁新草稿');expect(title).toHaveValue('保留未送出文字');
    fireEvent.click(screen.getByText('已核對目前狀態，保留文字並關閉原移除'));await screen.findByText('已關閉原移除，保留本頁文字；沒有再次送出移除。');expect(title).toHaveValue('保留未送出文字');expect(pending.size).toBe(0);expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);expect(exists).toBe(true);
  });
  it('missing GET never claims removed and offers a two-step hash-only safe stop',async()=>{
    const raw=await photoRemovalJournal(mediaId,0);pending.set(await pendingRequestKey(API_URL,19,'listing-photo-remove'),raw);render(view());await screen.findByText(/恢復仍待確認/);
    fireEvent.click(screen.getByText('安全停止原移除'));expect(calls.every(c=>c.method==='GET')).toBe(true);fireEvent.click(screen.getByText('保留原移除'));expect(pending.size).toBe(1);
    fireEvent.click(screen.getByText('安全停止原移除'));fireEvent.click(screen.getByText('確認安全停止移除'));await screen.findByText(/原移除已安全停止/);expect(exists).toBe(true);const post=calls.find(c=>c.method==='POST')!;expect(JSON.parse(post.body!)).toEqual({requestHash:(await parsePhotoRemovalJournal(raw)).requestHash});expect(pending.size).toBe(0);
  });
  it('confirmed receipt cleanup failure offers only cleanup and never retransmits',async()=>{
    render(view());await screen.findByDisplayValue('原始私人商品');vi.mocked(privatePendingStore.clear).mockRejectedValueOnce(Error('quota'));await remove();await screen.findByText(/原移除結果已確認，但本機紀錄尚未清理/);expect(screen.queryByText('重試同一照片移除')).toBeNull();
    fireEvent.click(screen.getByText('重試移除紀錄清理'));await waitFor(()=>expect(pending.size).toBe(0));expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);
  });
  it('repeated inventory outage preserves confirmed removal truth and never offers another POST',async()=>{
    rejectRemovedInventory=true;render(view());await remove();await screen.findByText('原移除回執已確認，但目前清單尚未同步；請只讀查核，不要重送。');
    fireEvent.click(screen.getByText('重試移除紀錄清理'));await screen.findByText('原移除回執已確認，但目前清單尚未同步；請只重試查核與清理，不要重送。');
    expect(screen.queryByText('重試同一照片移除')).toBeNull();expect(pending.size).toBe(1);expect(exists).toBe(false);
    rejectRemovedInventory=false;fireEvent.click(screen.getByText('重試移除紀錄清理'));await waitFor(()=>expect(pending.size).toBe(0));expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);
  });
  it('a late previous-account removal ACK cannot clear old evidence or change replacement account',async()=>{
    hold=true;const mounted=render(view());await remove();await waitFor(()=>expect(release).toBeTypeOf('function'));const key=await pendingRequestKey(API_URL,19,'listing-photo-remove');
    mounted.rerender(view({...auth,user:{id:20,phoneNumber:'other'},token:'other-session'}));await screen.findByText('還沒有私人商品照片，現在就拍第一件吧。');await act(async()=>release!());expect(pending.has(key)).toBe(true);expect(screen.queryByText('原私人照片移除結果待確認')).toBeNull();
  });
  it('invalid stored removal stops before inventory or any mutation',async()=>{
    pending.set(await pendingRequestKey(API_URL,19,'listing-photo-remove'),'{bad');render(view());await screen.findByText(/此瀏覽器無法讀取安全刊登紀錄/);expect(calls).toHaveLength(0);
  });
  it('same-turn double removal sends only once and late ACK cannot clear another marker',async()=>{
    hold=true;render(view());const button=await screen.findByLabelText('刪除第 1 件私人照片');await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);fireEvent.click(button);await waitFor(()=>expect(release).toBeTypeOf('function'));
    const key=await pendingRequestKey(API_URL,19,'listing-photo-remove'),newer=await photoRemovalJournal(mediaId,0);pending.set(key,newer);await act(async()=>release!());await screen.findByText(/另一份移除紀錄仍待查核/);expect(pending.get(key)).toBe(newer);expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);
  });
  it('GET outage preserves frozen journal and the photo instead of treating absence as success',async()=>{
    rejectGet=true;const raw=await photoRemovalJournal(mediaId,0);pending.set(await pendingRequestKey(API_URL,19,'listing-photo-remove'),raw);render(view());await screen.findByText(/恢復仍待確認/);fireEvent.click(screen.getByText('查核原照片移除'));await screen.findByText(/原移除結果仍待查核/);expect(pending.size).toBe(1);expect(exists).toBe(true);expect(calls.every(c=>c.method==='GET')).toBe(true);
  });
});
