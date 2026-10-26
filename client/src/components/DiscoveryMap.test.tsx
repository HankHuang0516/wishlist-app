import {act,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import DiscoveryMap from './DiscoveryMap';
import type {DiscoveryPage,DiscoveryProduct} from '../lib/discovery';
const mocks=vi.hoisted(()=>({maps:[] as any[],fail:false}));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url',()=>({default:'/synthetic-map-worker.js'}));
vi.mock('maplibre-gl',()=>({setWorkerUrl:vi.fn(),NavigationControl:class{},Map:class{
 handlers:Record<string,()=>void>={};constructor(){if(mocks.fail)throw Error('No WebGL');mocks.maps.push(this);}
 on=(name:string,handler:()=>void)=>{this.handlers[name]=handler;};addControl=vi.fn();fitBounds=vi.fn();resize=vi.fn(()=>{this.handlers.movestart?.();this.handlers.move?.();});remove=vi.fn();
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
const enter=()=>act(()=>mocks.maps[0].handlers.load());
const expand=()=>fireEvent.click(screen.getByRole('button',{name:'展開附近 36 件商品'}));
it('starts collapsed, explicitly expands all36 members, and opens details only after a separate action',()=>{
 const search=vi.fn(),open=vi.fn(),view=render(<DiscoveryMap page={page} onOpen={open} onSearchBounds={search} initialSelection={items[0].key}/>);
 enter();expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(0);expect(view.container.querySelector('.discovery-map-preview')).toBeNull();expect(Element.prototype.animate).not.toHaveBeenCalled();
 expand();expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(36);
 for(const p of items){fireEvent.click(screen.getByRole('button',{name:'選取商品：'+p.title,exact:true}));expect(view.container.querySelector('.discovery-map-preview strong')).toHaveTextContent(p.title);expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(36);}
 expect(open).not.toHaveBeenCalled();expect(search).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'查看商品詳情'}));expect(open).toHaveBeenCalledExactlyOnceWith(items[35]);
 act(()=>{mocks.maps[0].handlers.movestart();mocks.maps[0].handlers.move();});expect(search).not.toHaveBeenCalled();expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'搜尋目前地圖範圍'}));expect(search).toHaveBeenCalledExactlyOnceWith([120,22,121,24]);
 expect(items[35].mapLocation!.coordinates).toEqual([120.271,23]);
});
it('offers the unchanged filtered list if WebGL cannot start, without auto-expanding products',()=>{
 mocks.fail=true;const list=vi.fn(),view=render(<DiscoveryMap page={page} onOpen={vi.fn()} onSearchBounds={vi.fn()} onList={list}/>);
 expect(screen.getByRole('alert')).toHaveTextContent('目前無法啟動地圖底圖');expect(screen.getByRole('button',{name:'搜尋目前地圖範圍'})).toBeDisabled();expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(0);expect(screen.getByText('本批 36 件商品')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'返回同條件商品列表'}));expect(list).toHaveBeenCalledOnce();
});
it('retains every expanded member and offers photo retry after an image fails',()=>{
 const view=render(<DiscoveryMap page={page} onOpen={vi.fn()} onSearchBounds={vi.fn()}/>);enter();expand();
 fireEvent.error(view.container.querySelector('.discovery-map-thumbnail img')!);expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(36);
 fireEvent.click(screen.getByRole('button',{name:'選取商品：合成地圖商品 0',exact:true}));expect(screen.getByRole('button',{name:'重新載入這張照片'})).toBeVisible();
});
it('respects reduced motion on both expansion and collapse, with no automatic search',()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 const search=vi.fn(),view=render(<DiscoveryMap page={page} onOpen={vi.fn()} onSearchBounds={search}/>);enter();expand();
 expect(Element.prototype.animate).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'收合商品'}));expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(0);expand();
 fireEvent.click(screen.getByRole('button',{name:'來源與排列說明'}));expect(screen.getByRole('button',{name:'慢速重播排列'})).toBeDisabled();fireEvent(window,new Event('resize'));expect(search).not.toHaveBeenCalled();
});
it('keeps the real count and explicit recovery while tile loading never settles',()=>{
 vi.useFakeTimers();const search=vi.fn(),view=render(<DiscoveryMap page={page} onOpen={vi.fn()} onSearchBounds={search}/>);
 expect(screen.getAllByRole('status').some(p=>p.textContent?.includes('底圖載入中'))).toBe(true);
 act(()=>vi.advanceTimersByTime(15000));expect(screen.getByRole('alert')).toHaveTextContent('底圖尚未完整載入');
 expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(0);expect(screen.getByText('本批 36 件商品')).toBeVisible();expect(search).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'重新載入底圖'}));expect(mocks.maps).toHaveLength(2);expect(search).not.toHaveBeenCalled();
});
it('animates collapse on blank tap, ignores a drag, and never opens details from either gesture',()=>{
 vi.useFakeTimers();vi.stubGlobal('PointerEvent',MouseEvent);const open=vi.fn(),search=vi.fn(),view=render(<DiscoveryMap page={page} onOpen={open} onSearchBounds={search}/>);enter();expand();
 const canvas=view.container.querySelector('.discovery-map-canvas')!;
 fireEvent.pointerDown(canvas,{clientX:10,clientY:10});fireEvent.pointerUp(canvas,{clientX:10,clientY:80});act(()=>vi.advanceTimersByTime(300));expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(36);
 fireEvent.pointerDown(canvas,{clientX:10,clientY:400});fireEvent.pointerUp(canvas,{clientX:11,clientY:400});expect(screen.getByRole('button',{name:'收合商品'})).toBeDisabled();expect(Element.prototype.animate).toHaveBeenCalled();act(()=>vi.advanceTimersByTime(280));expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(0);expect(screen.getByRole('button',{name:'展開附近 36 件商品'})).toBeVisible();expect(open).not.toHaveBeenCalled();expect(search).not.toHaveBeenCalled();
});
it('expands only the chosen geographic stack and clears it when query data changes',()=>{
 const view=render(<DiscoveryMap page={page} onOpen={vi.fn()} onSearchBounds={vi.fn()}/>);
 mocks.maps[0].project.mockImplementation((coordinates:number[])=>({x:coordinates[0]<120.254?80:280,y:150}));enter();
 expect(screen.getAllByRole('button',{name:'展開附近 18 件商品'})).toHaveLength(2);fireEvent.click(screen.getAllByRole('button',{name:'展開附近 18 件商品'})[0]);expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(18);
 const changed={...page,items:page.items.slice(1)};view.rerender(<DiscoveryMap page={changed} onOpen={vi.fn()} onSearchBounds={vi.fn()}/>);expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(0);expect(view.container.querySelector('.discovery-map-preview')).toBeNull();
});
it('supports Escape and explicit collapse without a delayed animation reopening the stack',()=>{
 vi.useFakeTimers();const view=render(<DiscoveryMap page={page} onOpen={vi.fn()} onSearchBounds={vi.fn()}/>);enter();expand();fireEvent.keyDown(window,{key:'Escape'});act(()=>vi.advanceTimersByTime(300));expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(0);expand();fireEvent.click(screen.getByRole('button',{name:'收合商品'}));act(()=>vi.advanceTimersByTime(4000));expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(0);
});

it('allows explicit stacks after real style readiness while truthfully reporting incomplete tiles, without reopening on late load',()=>{
 vi.useFakeTimers();const search=vi.fn(),view=render(<DiscoveryMap page={page} onOpen={vi.fn()} onSearchBounds={search}/>);act(()=>mocks.maps[0].handlers['style.load']());expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(0);expand();expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(36);
 act(()=>vi.advanceTimersByTime(15000));expect(screen.getByRole('alert')).toHaveTextContent('底圖尚未完整載入');expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(36);act(()=>mocks.maps[0].handlers.load());expect(screen.queryByRole('alert')).toBeNull();expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(36);expect(search).not.toHaveBeenCalled();expect(mocks.maps[0].fitBounds).toHaveBeenCalledTimes(1);
});

it('does not collapse after a cancelled touch gesture or a secondary-button click',()=>{
 vi.stubGlobal('PointerEvent',MouseEvent);const view=render(<DiscoveryMap page={page} onOpen={vi.fn()} onSearchBounds={vi.fn()}/>);enter();expand();const canvas=view.container.querySelector('.discovery-map-canvas')!;
 fireEvent.pointerDown(canvas,{clientX:20,clientY:400});fireEvent.pointerCancel(canvas);fireEvent.pointerUp(canvas,{clientX:20,clientY:400});expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(36);
 fireEvent.pointerDown(canvas,{button:2,clientX:20,clientY:400});fireEvent.pointerUp(canvas,{button:2,clientX:20,clientY:400});expect(view.container.querySelectorAll('.discovery-map-thumbnail')).toHaveLength(36);
});
