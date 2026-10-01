import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ListingBatchPage from './ListingBatchPage';
import MyListingsPage from './MyListingsPage';
import { marketplaceOrigin } from '../lib/managedListingWeb';

const drafts = vi.hoisted(() => new Map<string, string>());
vi.mock('../lib/webPendingStore',async original=>({...await original<typeof import('../lib/webPendingStore')>(),privatePendingStore:{get:async(key:string)=>drafts.get(key)??null,replaceDraft:async(key:string,expected:string|null,raw:string)=>{if((drafts.get(key)??null)!==expected)throw Error('CAS');drafts.set(key,raw);}}}));
beforeEach(() => drafts.clear());
vi.mock('../components/PrivateMarketplacePhoto',()=>({default:()=> <span>合成私人照片</span>}));
// This contract probe tests the real parent gate and refresh, independently of
// the actual assistant component's own HTTP/drag/drop/recovery tests.
vi.mock('../components/MarketingAssistantWeb',()=>({default:({beforeApprove,onApproved}:{beforeApprove:()=>Promise<(()=>void)|null>;onApproved:()=>Promise<void>})=>{
  const [result,setResult]=useState('');
  return <><button onClick={async()=>{const release=await beforeApprove();if(!release){setResult('HOST_BLOCKED');return;}try{await onApproved();setResult('HOST_REFRESHED');}catch{setResult('HOST_READ_FAILED');}finally{release();}}}>測試行銷批准入口</button><span>{result}</span></>;
}}));
const id='11111111-1111-4111-8111-111111111111',photo='22222222-2222-4222-8222-222222222222';
const auth={user:{id:19,phoneNumber:'synthetic'},token:'synthetic-session',login:vi.fn(),logout:vi.fn(),refreshUser:vi.fn(),isAuthenticated:true};
const form={title:'合成橘色檯燈',description:'合成商品原始說明，非真實庫存。',brand:'',category:'home',condition:'USED',price:'350'};
const draft={clientListingId:id,form,touched:{title:true,description:true,brand:true,category:true,condition:true,price:true}};
const ai={title:form.title,description:form.description,brand:null,category:'home',condition:'USED',estimatedPriceLowTwd:100,estimatedPriceHighTwd:600,priceBasis:'僅供合成驗收',evidence:['合成照片','合成桌燈'],uncertainties:['非模型結果'],confidence:0.8,source:'MINIMAX_CODE_VISION'};
const media={id:photo,aiDraftStatus:'COMPLETED',aiDraft:ai,sellerDraft:draft,sellerDraftVersion:1};
const row={id,ownerUserId:19,owner:{id:19},version:1,title:form.title,description:form.description,status:'ACTIVE',condition:'USED',category:'home',price:'350',currency:'TWD',createdAt:'2026-09-29T00:00:00Z',publishedAt:'2026-09-29T00:00:00Z',expiresAt:'2100-10-30T15:59:59Z',location:{county:'臺北市',district:'中山區'},media:[{id:photo,imageUrl:marketplaceOrigin()+'/api/listing-media/'+photo+'/image',thumbnailUrl:marketplaceOrigin()+'/api/listing-media/'+photo+'/thumbnail',position:0,capturePurpose:'MANUAL_PHOTO'}]};
const ok=(value:unknown)=>({ok:true,status:200,json:async()=>value});
const view=(Page:typeof ListingBatchPage|typeof MyListingsPage,a=auth)=><MemoryRouter><AuthContext.Provider value={a}><Page/></AuthContext.Provider></MemoryRouter>;
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
describe('marketing approval cannot replace unsaved parent edits',()=>{
  it.each(['draft','published'] as const)('rejects %s unsaved edits without an additional read or write',async kind=>{
    const fetch=vi.fn(async(url:string)=>ok(url.includes('/unused')?{items:[media],nextCursor:null}:url.endsWith('/ai-availability')?{available:true}:{items:[row],nextCursor:null}));vi.stubGlobal('fetch',fetch);
    render(view(kind==='draft'?ListingBatchPage:MyListingsPage));await screen.findByText(form.title,{selector:kind==='draft'?'h3':'h2'});
    if(kind==='published'){ await waitFor(()=>expect(screen.getByRole('button',{name:'編輯資訊'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'編輯資訊'})); await waitFor(()=>expect(screen.getByLabelText('商品名稱')).toBeEnabled()); }
    fireEvent.change(screen.getByLabelText('商品名稱'),{target:{value:'我尚未儲存的新名称'}});const calls=fetch.mock.calls.length;
    fireEvent.click(screen.getByText('測試行銷批准入口'));await screen.findByText('HOST_BLOCKED');expect(screen.getByLabelText('商品名稱')).toHaveValue('我尚未儲存的新名称');expect(fetch).toHaveBeenCalledTimes(calls);
  });
  it.each(['draft','published'] as const)('locks %s fields until actual refresh completes and adopts the returned description',async kind=>{
    let finish!:(value:unknown)=>void;let reads=0;
    const fetch=vi.fn(async(url:string)=>{if(url.endsWith('/ai-availability'))return ok({available:true});if(++reads===1)return ok(kind==='draft'?{items:[media],nextCursor:null}:{items:[row],nextCursor:null});return await new Promise(resolve=>{finish=resolve;});});vi.stubGlobal('fetch',fetch);
    render(view(kind==='draft'?ListingBatchPage:MyListingsPage));await screen.findByText(form.title,{selector:kind==='draft'?'h3':'h2'});
    if(kind==='published'){ await waitFor(()=>expect(screen.getByRole('button',{name:'編輯資訊'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'編輯資訊'})); await waitFor(()=>expect(screen.getByLabelText('商品名稱')).toBeEnabled()); }
    fireEvent.click(screen.getByText('測試行銷批准入口'));await waitFor(()=>expect(finish).toBeDefined());expect(screen.getByLabelText('商品說明')).toBeDisabled();
    const description=form.description+'【合成行銷文案】並非AI成果';
    await act(async()=>finish(ok(kind==='draft'?{items:[{...media,sellerDraftVersion:2,sellerDraft:{...draft,form:{...form,description}}}],nextCursor:null}:{...row,version:2,description})));
    await screen.findByText('HOST_REFRESHED');expect(screen.getByLabelText('商品說明')).toHaveValue(description);expect(screen.getByLabelText('商品說明')).toBeEnabled();
  });
  it.each(['draft','published'] as const)('propagates %s refresh failure without clearing local content',async kind=>{
    let reads=0;vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url.endsWith('/ai-availability'))return ok({available:true});if(++reads===1)return ok(kind==='draft'?{items:[media],nextCursor:null}:{items:[row],nextCursor:null});throw Error('network unavailable');}));
    render(view(kind==='draft'?ListingBatchPage:MyListingsPage));await screen.findByText(form.title,{selector:kind==='draft'?'h3':'h2'});if(kind==='published'){ await waitFor(()=>expect(screen.getByRole('button',{name:'編輯資訊'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'編輯資訊'})); await waitFor(()=>expect(screen.getByLabelText('商品名稱')).toBeEnabled()); }
    fireEvent.click(screen.getByText('測試行銷批准入口'));await screen.findByText('HOST_READ_FAILED');expect(screen.getByLabelText('商品說明')).toHaveValue(form.description);expect(screen.getByLabelText('商品說明')).toBeEnabled();
  });
});
