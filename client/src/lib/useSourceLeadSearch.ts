import {useEffect,useState} from 'react';
import {api} from './marketplaceApi';
import {parseLeadPage,parseLead,type SourceLead} from './sourceLeadData';
import type {ExploreQuery} from './exploreWeb';
export function useSourceLeadSearch(token:string,query:ExploreQuery|null) {
 const [items,setItems]=useState<SourceLead[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[completedSerial,setCompletedSerial]=useState(0);
 const hidden=!!query&&(!!query.wishId||!!query.filters.brand||!!query.filters.category||!!query.filters.delivery||!!query.filters.condition||!!query.filters.minPrice||!!query.filters.maxPrice||query.filters.q.length>80);
 useEffect(()=>{let active=true;const controller=new AbortController();setItems([]);setError('');setCompletedSerial(0);setBusy(!!query&&!hidden);if(!query||hidden){if(query)setCompletedSerial(query.serial);return()=>controller.abort();}
 let loading=false;async function load(){if(loading)return;loading=true;try{const rows:SourceLead[]=[];let cursor:string|null=null;const seen=new Set<string>();do{const path='/source-leads?presentation=1&bbox='+query!.bounds.join(',')+'&q='+encodeURIComponent(query!.filters.q)+(cursor?'&cursor='+cursor:'');const p=parseLeadPage(await api<unknown>(token,path,{signal:controller.signal}));rows.push(...p.items);cursor=p.nextCursor;if(cursor&&seen.has(cursor))throw Error();if(cursor)seen.add(cursor);if(rows.length>=500&&cursor)throw Error('請縮小範圍再搜尋');}while(cursor);if(active)setItems([...new Map(rows.map(r=>[r.id,r])).values()]);}catch{if(active)setError('來源線索未完成讀取，不代表沒有資料；請重新搜尋。');}finally{loading=false;if(active){setBusy(false);setCompletedSerial(query!.serial);}}}
 void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},30000);return()=>{active=false;controller.abort();clearInterval(timer);};
 },[token,query,hidden]);
 return{completedSerial,items:(completedSerial===query?.serial?items:[]).filter(r=>{try{parseLead(r);return true;}catch{return false;}}),busy:busy||!!query&&completedSerial!==query.serial,error,hidden};
}
