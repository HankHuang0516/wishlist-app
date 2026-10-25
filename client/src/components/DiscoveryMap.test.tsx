import {act,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import DiscoveryMap from './DiscoveryMap';
import type {DiscoveryPage,DiscoveryProduct} from '../lib/discovery';
const mocks=vi.hoisted(()=>({maps:[] as any[],fail:false}));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url',()=>({default:'/synthetic-map-worker.js'}));
vi.mock('maplibre-gl',()=>({setWorkerUrl:vi.fn(),NavigationControl:class{},Map:class{
 handlers:Record<string,()=>void>={};constructor(){if(mocks.fail)throw Error('No WebGL');mocks.maps.push(this);}
 on=(name:string,handler:()=>void)=>{this.handlers[name]=handler;};addControl=vi.fn();fitBounds=vi.fn();resize=vi.fn();remove=vi.fn();
 project=vi.fn(()=>({x:120,y:150}));getBounds=()=>({getWest:()=>120,getSouth:()=>22,getEast:()=>121,getNorth:()=>24});
}}));
vi.mock('./ProductWishButton',()=>({default:()=> <button>真正願望流程由其端到端測試驗證</button>}));
vi.mock('./ProductInterest',()=>({default:()=>null}));
const oldAnimate=Element.prototype.animate;
beforeEach(()=>{
 localStorage.setItem('user-locale','zh-TW');mocks.maps=[];mocks.fail=false;
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 Element.prototype.animate=vi.fn(()=>({finished:new Promise(()=>{}),pause:vi.fn(),play:vi.fn(),cancel:vi.fn()} as unknown as Animation));
});
afterEach(()=>{vi.useRealTimers();Element.prototype.animate=oldAnimate;vi.unstubAllGlobals();vi.restoreAllMocks();localStorage.clear();});
const items=Array.from({length:36},(_,i)=>({kind:'source',id:String(i),key:'source:'+i,title:'合成地圖商品 '+i,mainId:'main'+i%4,subId:'a',price:500,currency:'TWD',priceText:'500',priceUnitVerified:true,thumbnailUrl:'https://example.invalid/'+i,photos:[],county:'臺南市',district:'永康區',sourceLabel:'公開測試來源',mapLocation:{coordinates:[120.236+i/1000,23],precision:'PUBLIC_MEETING_POINT'}} as DiscoveryProduct));
const page={items,categories:Array.from({length:4},(_,i)=>({id:'main'+i,label:'分類 '+i,en:'Category '+i,children:[{id:'a',label:'商品',en:'Items'}]})),total:36,mapTotals:{located:36,unmapped:0},nextCursor:null} as DiscoveryPage;
it('retains 36 individually selectable thumbnails, keeps their real locations, and searches only on an explicit button',()=>{
 const search=vi.fn(),open=vi.fn(),view=render(<DiscoveryMap page={page} onOpen={open} onSearchBounds={search}/>);
 act(()=>mocks.maps[0].handlers.load());expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(36);
 for(const p of items){fireEvent.click(screen.getByRole('button',{name:'選取商品：'+p.title,exact:true}));expect(view.container.querySelector('.discovery-map-preview strong')).toHaveTextContent(p.title);expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(36);}
 expect(open).not.toHaveBeenCalled();expect(search).not.toHaveBeenCalled();
 act(()=>{mocks.maps[0].handlers.movestart();mocks.maps[0].handlers.move();});expect(search).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'搜尋目前地圖範圍'}));expect(search).toHaveBeenCalledExactlyOnceWith([120,22,121,24]);
 fireEvent.click(screen.getByRole('button',{name:'查看商品詳情'}));expect(open).toHaveBeenCalledExactlyOnceWith(items[35]);
 expect(items[35].mapLocation!.coordinates).toEqual([120.271,23]);
});
it('keeps all product nodes and a visible recovery message when WebGL cannot start or a photo fails',()=>{
 mocks.fail=true;const view=render(<DiscoveryMap page={page} onOpen={vi.fn()} onSearchBounds={vi.fn()}/>);
 expect(screen.getByRole('alert')).toHaveTextContent('目前無法啟動地圖底圖');expect(screen.getByRole('button',{name:'搜尋目前地圖範圍'})).toBeDisabled();
 fireEvent.error(view.container.querySelector('.discovery-map-thumbnail img')!);expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(36);
 fireEvent.click(screen.getByRole('button',{name:'選取商品：合成地圖商品 0',exact:true}));expect(screen.getByRole('button',{name:'重新載入這張照片'})).toBeVisible();
});
it('respects reduced motion and never automatically searches on selection, replay or resize',()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 const search=vi.fn();render(<DiscoveryMap page={page} onOpen={vi.fn()} onSearchBounds={search}/>);act(()=>mocks.maps[0].handlers.load());
 expect(Element.prototype.animate).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'來源與排列說明'}));expect(screen.getByRole('button',{name:'慢速重播排列'})).toBeDisabled();fireEvent(window,new Event('resize'));expect(search).not.toHaveBeenCalled();
});

it('keeps36 products and an explicit basemap retry when live tile loading never settles',()=>{
 vi.useFakeTimers();const search=vi.fn(),view=render(<DiscoveryMap page={page} onOpen={vi.fn()} onSearchBounds={search}/>);
 expect(screen.getByRole('status')).toHaveTextContent('底圖載入中');
 act(()=>vi.advanceTimersByTime(15000));expect(screen.getByRole('alert')).toHaveTextContent('底圖尚未完整載入');
 expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(36);expect(search).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'重新載入底圖'}));expect(mocks.maps).toHaveLength(2);expect(search).not.toHaveBeenCalled();
});
