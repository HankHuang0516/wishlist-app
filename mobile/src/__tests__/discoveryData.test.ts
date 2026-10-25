import {describe,expect,it} from 'vitest';
import {defaultDiscovery,discoveryPrice,mergeDiscoveryPage,nativeDiscoveryPath,parseNativeDiscovery} from '../discoveryData';
import {registerVisualQaRuntimeApplicationId} from '../api';
const api='https://wishlist.example/api',id='12345678-1234-4234-8234-123456789abc';
const product=()=>({kind:'listing',id,key:'listing:'+id,title:'二手螢幕',description:'實際商品說明',mainId:'electronics',subId:'monitors',price:750,priceText:'750',currency:'TWD',priceUnitVerified:true,thumbnailUrl:'/api/listings/photo',photos:[],county:'臺南市',district:'永康區',condition:'USED',sourceLabel:'Wishlist',stockStatus:'ACTIVE',date:'2026-10-25T00:00:00Z',dateBasis:'PUBLISHED',dateEarliest:null});
const page=()=>({items:[product()],categories:[{id:'electronics',label:'3C電子',count:1,children:[{id:'monitors',label:'螢幕',count:1}]}],counties:['臺南市'],nextCursor:null as string|null,snapshot:'a'.repeat(64),total:1,counts:{listing:1,source:0,external:0},complete:true,generatedAt:'2026-10-25T00:00:00Z',unknownPriceExcluded:false});
describe('native discovery contract and safe navigation',()=>{
 it('accepts real API metadata and resolves only safe public image URLs',()=>{
  const parsed=parseNativeDiscovery(page(),api);expect(parsed.items[0].thumbnailUrl).toBe('https://wishlist.example/api/listings/photo');expect(parsed.total).toBe(1);
  for(const url of ['javascript:alert(1)','//other.example/photo','https://user:secret@example.com/photo','http://other.example/photo'])expect(()=>parseNativeDiscovery({...page(),items:[{...product(),thumbnailUrl:url}]},api)).toThrow();
 });
 it('allows same-origin HTTP solely in explicit local QA mode',()=>{
  const local='http://127.0.0.1:18889/api';expect(()=>parseNativeDiscovery(page(),local)).toThrow();expect(parseNativeDiscovery(page(),local,true).items[0].thumbnailUrl).toContain('127.0.0.1:18889');
 });
 it('honors the existing isolated static QA binary guard without allowing HTTP for the store identity',()=>{
  const prior=process.env.EXPO_PUBLIC_VISUAL_QA;process.env.EXPO_PUBLIC_VISUAL_QA='1';
  try{registerVisualQaRuntimeApplicationId('com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1.visualqa202610251640');expect(parseNativeDiscovery(page(),'http://127.0.0.1:18889').items[0].thumbnailUrl).toContain('http://127.0.0.1:18889/');registerVisualQaRuntimeApplicationId('com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1');expect(()=>parseNativeDiscovery(page(),'http://127.0.0.1:18889')).toThrow();}finally{registerVisualQaRuntimeApplicationId(null);if(prior===undefined)delete process.env.EXPO_PUBLIC_VISUAL_QA;else process.env.EXPO_PUBLIC_VISUAL_QA=prior;}
 });
 it('rejects invented zero counts, duplicate rows, malformed product identity and incomplete scans',()=>{
  for(const value of [{...page(),total:0},{...page(),items:[product(),product()],total:2,counts:{listing:2,source:0,external:0}},{...page(),items:[{...product(),key:'source:'+id}]},{...page(),complete:false},{...page(),items:[{...product(),price:NaN}]}])expect(()=>parseNativeDiscovery(value,api)).toThrow();
 });
 it('sends only the selected owned-wish scope to the recommendation endpoint',()=>{
  const path=nativeDiscoveryPath({...defaultDiscovery,feed:'for-you',sort:'recommended',q:'螢幕 & BenQ'},'',42);expect(path).toContain('/discovery/for-you?');const params=new URLSearchParams(path.split('?')[1]);expect(params.get('wish')).toBe('42');expect(params.get('q')).toBe('螢幕 & BenQ');expect(()=>nativeDiscoveryPath(defaultDiscovery,'',42)).toThrow();
 });
 it('does not mix changed snapshots, repeated cursors or duplicate products',()=>{
  const first=parseNativeDiscovery({...page(),nextCursor:'next'},api);const other=structuredClone(page());other.items[0].id='12345678-1234-4234-8234-123456789abd';other.items[0].key='listing:'+other.items[0].id;other.total=2;other.counts.listing=2;
  const next=parseNativeDiscovery(other,api);expect(mergeDiscoveryPage(first,next,'next').items).toHaveLength(2);
  for(const value of [{...next,snapshot:'b'.repeat(64)},{...next,nextCursor:'next'},parseNativeDiscovery(page(),api)])expect(()=>mergeDiscoveryPage(first,value,'next')).toThrow();
 });
 it('shows free goods honestly and preserves unknown or foreign currency prices',()=>{
  const p=parseNativeDiscovery(page(),api).items[0];expect(discoveryPrice({...p,price:0})).toBe('免費贈送');expect(discoveryPrice({...p,price:null,priceText:'',currency:null})).toBe('價格待詢問');expect(discoveryPrice({...p,price:null,currency:'USD',priceText:'20'})).toBe('USD 20');
 });
});

it('retains verified model-bound retail evidence while ignoring malformed optional evidence',()=>{
 const retail={productKey:'listing:'+id,currency:'TWD',price:4990,priceType:'MANUFACTURER_MSRP',sourceUrl:'https://www.benq.com/zh-tw/',sourceTitle:'同型號原價',sourcePeriod:null,checkedAt:'2026-10-25T00:00:00Z'};
 const read=(reference:unknown)=>parseNativeDiscovery({...page(),items:[{...product(),retail:reference}]},api).items[0];
 expect(read(retail).retail?.price).toBe(4990);
 for(const r of [{...retail,price:0},{...retail,productKey:'source:'+id},{...retail,sourceUrl:'javascript:alert(1)'}]){expect(read(r).retail).toBeUndefined();expect(read(r).title).toBe(product().title);}
});

it('sends map presentation without losing any shared filters or the owned-wish scope',()=>{
 const f={...defaultDiscovery,q:'螢幕',main:'electronics',sub:'monitors',county:'臺南市',source:'source' as const,condition:'UNKNOWN',min:'0',max:'1500',feed:'for-you' as const,sort:'recommended' as const};
 const path=nativeDiscoveryPath(f,'',42,{bbox:[120,22,121,24]}),p=new URLSearchParams(path.split('?')[1]);
 for(const [key,value]of Object.entries({presentation:'map',q:'螢幕',main:'electronics',sub:'monitors',county:'臺南市',source:'source',condition:'UNKNOWN',min:'0',max:'1500',wish:'42',bbox:'120,22,121,24'}))expect(p.get(key)).toBe(value);
});
it('does not invent zero map results for missing geometry or inconsistent map totals',()=>{
 const map={...page(),mapTotals:{located:1,unmapped:0},items:[{...product(),mapLocation:{coordinates:[120.236,23],precision:'PUBLIC_MEETING_POINT'}}]};
 expect(parseNativeDiscovery(map,api,false,true).items[0].mapLocation?.coordinates).toEqual([120.236,23]);
 for(const v of [{...page()},{...map,mapTotals:{located:0,unmapped:0}},{...map,items:[product()]},{...map,items:[{...product(),mapLocation:{coordinates:[0,0],precision:'PUBLIC_MEETING_POINT'}}]}])expect(()=>parseNativeDiscovery(v,api,false,true)).toThrow();
});
