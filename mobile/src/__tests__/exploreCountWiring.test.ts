import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { isExploreViewportEmpty, parseExploreCounts } from '../exploreCounts';

// Execute the real screen's JSX under controlled hooks/primitives. This checks
// BOTH mapNotice and FlatList.ListEmptyComponent wiring, not native OS rendering.
function screenHarness(source: {count:number;ready:boolean;busy:boolean;error:string}, listMode:boolean, api?:()=>Promise<unknown>) {
  let state=0,effect=0,tree:any,cleanup:any,previous:any[]|undefined,dirty=false;
  const states:any[]=[],pending:(()=>void)[]=[];
  const element=(type:unknown,props:any,...children:any[])=>({type,props:{...props,children}});
  const react={createElement:element,useState:(initial:any)=>{const i=state++;
    if(!(i in states))states[i]=i===6?listMode:typeof initial==='function'?initial():initial;
    return [states[i],(value:any)=>{states[i]=typeof value==='function'?value(states[i]):value;dirty=true;}];},
    useRef:(v:any)=>({current:v}),useMemo:(fn:any)=>fn(),useCallback:(fn:any)=>fn,useEffect:(fn:any,deps:any[])=>{
      // Exercise the real count lifecycle effect; other screen layers remain
      // controlled fixtures, so this is not React/native OS acceptance.
      if(effect++===0&&api&&(!previous||deps.some((v,i)=>v!==previous![i]))){previous=deps;pending.push(()=>{cleanup?.();cleanup=fn();});}
    }};
  const geo=()=>({type:'FeatureCollection',features:[]});
  const common:any={ListingPhoto:()=>null,listingPresentation:{},useSourceLeads:()=>({...source,hidden:false,points:[],list:null,layers:null,modal:null}),
    emptySearchFilters:{q:'',brand:'',category:'',condition:'',delivery:'',minPrice:'',maxPrice:''},
    TAIWAN_BOUNDS:[117,20,123.8,26.6],listingGeoJSON:geo,externalGeoJSON:geo,
    listingSearchPath:()=>'/listings',externalSearchPath:()=>'/external-listings',
    expandedSearchBounds:(b:any)=>b,CATEGORIES:[],useSafeAreaInsets:()=>({top:0,bottom:0}),
    useWindowDimensions:()=>({width:390,fontScale:1}),StyleSheet:{create:(v:any)=>v,absoluteFill:{}},
    iosColors:{},iosRadius:{},iosShadow:{},iosFloatingShadow:{},iosSpacing:{},iosType:{},
    isExploreViewportEmpty,parseExploreCounts,
  };
  const code=fs.readFileSync(fileURLToPath(new URL('../ExploreScreen.tsx',import.meta.url)),'utf8');
  const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{} as any};
  vm.runInNewContext(js,{module,exports:module.exports,__DEV__:false,Date,Map,Set,
    require:(name:string)=>name==='react'?{__esModule:true,default:react,...react}:common});
  const read=api??(()=>Promise.resolve({}));
  function render(){dirty=false;state=0;effect=0;tree=module.exports.ExploreScreen({api:read,apiUrl:'https://example.com/api',userId:1,onOpenChat:()=>{},onOpenSourceChat:()=>{}});while(pending.length)pending.shift()!();if(dirty)render();}
  function text(v:any):string{if(typeof v==='string'||typeof v==='number')return String(v);if(Array.isArray(v))return v.map(text).join(' ');if(v&&typeof v==='object')return Object.values(v).map(text).join(' ');return '';}
  function retry(v:any):boolean{if(v?.props?.onPress&&text(v.props.children).includes('重新讀取全站數量')){expect(v.props.disabled).toBe(false);v.props.onPress();return true;}if(Array.isArray(v))return v.some(retry);if(v&&typeof v==='object')return Object.values(v).some(retry);return false;}
  render();return {text:()=>text(tree).replace(/\s+/g,' '),flush:async()=>{for(let i=0;i<10;i++)await Promise.resolve();render();},retry:()=>{expect(retry(tree)).toBe(true);render();},unmount:()=>cleanup?.()};
}
function screenText(source:{count:number;ready:boolean;busy:boolean;error:string},list:boolean){return screenHarness(source,list).text();}
describe('actual mobile ExploreScreen empty-state wiring',()=>{
  it.each([false,true])('does not show zero in map/list when source exists, is pending or failed; list=%s',list=>{
    for(const source of [{count:1,ready:true,busy:false,error:''},{count:0,ready:false,busy:true,error:''},
      {count:0,ready:true,busy:false,error:'來源503'}])
      expect(screenText(source,list)).not.toContain('目前地圖範圍 0 件');
  });
  it.each([false,true])('shows a true completed empty viewport in map/list; list=%s',list=>{
    expect(screenText({count:0,ready:true,busy:false,error:''},list)).toContain('目前地圖範圍 0 件');
  });
});

describe('actual count effect to screen state under controlled hooks',()=>{
 const source={count:0,ready:true,busy:false,error:''};
 const response=(n:number)=>({schemaVersion:1,scope:'GLOBAL_PUBLICATION_STATE',stockVerified:false,asOf:'2026-10-11T03:00:00Z',
  published:{sellerListings:0,sourceReferences:n,partnerListings:0,total:n},explorable:{sellerListings:0,sourceReferences:n,partnerListings:0,total:n}});
 it.each([false,true])('renders success, type split and valid zero after the actual async effect; list=%s',async list=>{
  let finish!:(v:unknown)=>void,calls=0;
  const h=screenHarness(source,list,()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
  expect(h.text()).toContain('全站已上架數量讀取中');finish(response(85));await h.flush();
  expect(h.text()).toContain('全站已上架 85 件');expect(h.text()).toContain('來源參考 85');
  expect(h.text()).toContain('台灣時間');expect(calls).toBe(1);
  h.retry();expect(h.text()).toContain('全站已上架數量讀取中');finish(response(0));await h.flush();
  expect(h.text()).toContain('全站已上架 0 件');expect(calls).toBe(2);h.unmount();
 });
 it.each(['503','malformed'])('shows unknown and explicit retry after %s, never fabricated zero',async failure=>{
  let calls=0;
  const h=screenHarness(source,false,()=>{calls++;return calls===1?(failure==='503'?Promise.reject(Error('503')):Promise.resolve({total:0})):Promise.resolve(response(3));});
  await h.flush();expect(h.text()).toContain('全站已上架數量未取得');expect(h.text()).not.toContain('全站已上架 0 件');expect(calls).toBe(1);
  h.retry();await h.flush();expect(h.text()).toContain('全站已上架 3 件');expect(calls).toBe(2);h.unmount();
 });
 it('ignores an old async response after unmount',async()=>{
  let finish!:(v:unknown)=>void;const h=screenHarness(source,false,()=>new Promise(resolve=>{finish=resolve;}));
  h.unmount();finish(response(99));await h.flush();expect(h.text()).not.toContain('全站已上架 99 件');
 });
});

it('map source summary is unknown while pending/failed and zero only after success',()=>{
 const list=false;
 expect(screenText({count:0,ready:false,busy:true,error:''},list)).not.toContain('來源線索 0 筆');
 expect(screenText({count:0,ready:true,busy:false,error:'來源503'},list)).not.toContain('來源線索 0 筆');
 expect(screenText({count:0,ready:false,busy:true,error:''},list)).toContain('來源線索數量讀取中');
 expect(screenText({count:0,ready:true,busy:false,error:'來源503'},list)).toContain('來源線索數量未取得');
 expect(screenText({count:0,ready:true,busy:false,error:''},list)).toContain('來源線索 0 筆');
});
