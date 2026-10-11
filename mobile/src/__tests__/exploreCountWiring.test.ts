import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { isExploreViewportEmpty } from '../exploreCounts';

// Execute the real screen's JSX under controlled hooks/primitives. This checks
// BOTH mapNotice and FlatList.ListEmptyComponent wiring, not native OS rendering.
function screenText(source: {count:number;ready:boolean;busy:boolean;error:string}, listMode:boolean) {
  let state=0;
  const element=(type:unknown,props:any,...children:any[])=>({type,props:{...props,children}});
  const react={createElement:element,useState:(initial:any)=>{const i=state++;
    return [i===6?listMode:typeof initial==='function'?initial():initial,()=>{}];},
    useRef:(v:any)=>({current:v}),useMemo:(fn:any)=>fn(),useCallback:(fn:any)=>fn,useEffect:()=>{}};
  const geo=()=>({type:'FeatureCollection',features:[]});
  const common:any={ListingPhoto:()=>null,listingPresentation:{},useSourceLeads:()=>({...source,hidden:false,points:[],list:null,layers:null,modal:null}),
    emptySearchFilters:{q:'',brand:'',category:'',condition:'',delivery:'',minPrice:'',maxPrice:''},
    TAIWAN_BOUNDS:[117,20,123.8,26.6],listingGeoJSON:geo,externalGeoJSON:geo,
    listingSearchPath:()=>'/listings',externalSearchPath:()=>'/external-listings',
    expandedSearchBounds:(b:any)=>b,CATEGORIES:[],useSafeAreaInsets:()=>({top:0,bottom:0}),
    useWindowDimensions:()=>({width:390,fontScale:1}),StyleSheet:{create:(v:any)=>v,absoluteFill:{}},
    iosColors:{},iosRadius:{},iosShadow:{},iosFloatingShadow:{},iosSpacing:{},iosType:{},
    isExploreViewportEmpty,parseExploreCounts:()=>{throw Error('unused')},
  };
  const code=fs.readFileSync(fileURLToPath(new URL('../ExploreScreen.tsx',import.meta.url)),'utf8');
  const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{} as any};
  vm.runInNewContext(js,{module,exports:module.exports,__DEV__:false,Date,Map,Set,
    require:(name:string)=>name==='react'?{__esModule:true,default:react,...react}:common});
  const tree=module.exports.ExploreScreen({api:()=>Promise.resolve({}),apiUrl:'https://example.com/api',userId:1,onOpenChat:()=>{},onOpenSourceChat:()=>{}});
  const strings:string[]=[];
  function collect(v:any){if(typeof v==='string')strings.push(v);else if(Array.isArray(v))v.forEach(collect);else if(v&&typeof v==='object')Object.values(v).forEach(collect);}
  collect(tree);return strings.join(' ');
}
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
