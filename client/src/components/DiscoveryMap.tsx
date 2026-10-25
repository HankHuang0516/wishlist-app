import {useEffect,useMemo,useRef,useState} from 'react';
import {Map as MapLibreMap,setWorkerUrl} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {libertyZhHantStyle} from '../lib/libertyZhHantStyle';
import {discoveryMapLayout} from '../lib/discoveryMapLayout';
import type {DiscoveryPage,DiscoveryProduct} from '../lib/discovery';
import {getDisplayLocale} from '../utils/localization';
import {DiscoveryPhoto} from './DiscoveryProductDetail';
import ProductWishButton from './ProductWishButton';
import ProductInterest from './ProductInterest';
import RetailPriceNote from './RetailPriceNote';
import MarketplaceDialog from './MarketplaceDialog';
import './DiscoveryMap.css';
setWorkerUrl(workerUrl);
const say=(zh:string,en:string)=>getDisplayLocale().startsWith('zh')?zh:en;
type Bounds=[number,number,number,number];

export default function DiscoveryMap({page,onOpen,onSearchBounds,initialSelection,onSelection,onList}:{page:DiscoveryPage;onOpen:(p:DiscoveryProduct)=>void;onSearchBounds:(bounds:Bounds)=>void;initialSelection?:string|null;onSelection?:(key:string|null)=>void;onList?:()=>void}){
 const frame=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null),mapRef=useRef<MapLibreMap|null>(null),latest=useRef(page);latest.current=page;
 const tiles=useRef(new Map<string,HTMLButtonElement>()),animations=useRef<Animation[]>([]),motionSequence=useRef(0),preview=useRef<HTMLDivElement>(null);
 const [info,setInfo]=useState(false),[width,setWidth]=useState(320),[frameHeight,setFrameHeight]=useState(480),[interaction,setInteraction]=useState(false),[fontScale,setFontScale]=useState(1),[ready,setReady]=useState(false),[mapIssue,setMapIssue]=useState(''),[attempt,setAttempt]=useState(0);
 const [selected,setSelected]=useState<string|null>(initialSelection??null),[point,setPoint]=useState<[number,number]|null>(null),[now,setNow]=useState(Date.now()),[reduced,setReduced]=useState(false),[paused,setPaused]=useState(false),[animating,setAnimating]=useState(false),[slow,setSlow]=useState(false),[replay,setReplay]=useState(0),[photoAttempts,setPhotoAttempts]=useState<Record<string,number>>({});
 const located=page.items.filter(p=>p.mapLocation&&(!p.mapLocation.visibleUntil||Date.parse(p.mapLocation.visibleUntil)>now));
 const unmapped=page.items.filter(p=>!located.some(l=>l.key===p.key));
 const catalog=page.categories.map(c=>({...c,label:say(c.label,c.en),children:c.children.map(s=>({...s,label:say(s.label,s.en)}))}));
 const layout=discoveryMapLayout(located,catalog,width,fontScale),signature=JSON.stringify(layout.nodes),selectedItem=located.find(p=>p.key===selected);
 const selectedRef=useRef(selectedItem);selectedRef.current=selectedItem;
 const positions=useMemo(()=>new Map(layout.nodes.map(n=>[n.key,n])),[signature]);
 const stop=()=>{motionSequence.current++;animations.current.forEach(a=>a.cancel());animations.current=[];setPaused(false);setAnimating(false);};
 const project=()=>{const p=selectedRef.current,m=mapRef.current;if(!p?.mapLocation||!m){setPoint(null);return;}const xy=m.project(p.mapLocation.coordinates);setPoint([xy.x,xy.y]);};
 const fit=()=>{const m=mapRef.current,ps=latest.current.items.filter(p=>p.mapLocation);if(!m||!ps.length)return;const xs=ps.map(p=>p.mapLocation!.coordinates[0]),ys=ps.map(p=>p.mapLocation!.coordinates[1]);m.fitBounds([[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)]],{padding:48,maxZoom:10,duration:0});};
 const searchHere=()=>{const b=mapRef.current?.getBounds();if(!b)return;const bounds:Bounds=[Math.max(-180,b.getWest()),Math.max(-85,b.getSouth()),Math.min(180,b.getEast()),Math.min(85,b.getNorth())].map(n=>Number(n.toFixed(8))) as Bounds;if(bounds[0]>=bounds[2]||bounds[1]>=bounds[3]){setMapIssue(say('此地圖範圍目前無法查詢，請縮小範圍後再試。','This map area cannot be searched. Zoom in and try again.'));return;}onSearchBounds(bounds);};
 useEffect(()=>{const host=frame.current;if(!host)return;const resize=()=>{setWidth(Math.max(280,Math.floor(host.clientWidth)));setFrameHeight(Math.min(560,Math.max(480,window.innerHeight*.64)));setFontScale(Math.max(1,(parseFloat(getComputedStyle(host).fontSize)||16)/16));mapRef.current?.resize();};const observer=new ResizeObserver(resize),rootObserver=new MutationObserver(resize);observer.observe(host);rootObserver.observe(document.documentElement,{attributes:true,attributeFilter:['style','class']});window.addEventListener('resize',resize);resize();return()=>{observer.disconnect();rootObserver.disconnect();window.removeEventListener('resize',resize);};},[]);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(media.matches);change();media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 useEffect(()=>{const future=page.items.map(p=>p.mapLocation?.visibleUntil?Date.parse(p.mapLocation.visibleUntil):Infinity).filter(t=>t>now&&Number.isFinite(t));if(!future.length)return;const timer=setTimeout(()=>setNow(Date.now()),Math.min(2147483647,Math.max(1,Math.min(...future)-now+5)));return()=>clearTimeout(timer);},[page.items,now]);
 useEffect(()=>{if(selected&&!selectedItem){setSelected(null);setPoint(null);}},[selected,selectedItem]);
 useEffect(()=>{
  if(!surface.current)return;setReady(false);setMapIssue('');
  let m:MapLibreMap;
  try{m=new MapLibreMap({container:surface.current,style:libertyZhHantStyle,center:[120.9,23.7],zoom:6,renderWorldCopies:false,attributionControl:false});}catch{setMapIssue(say('目前無法啟動地圖底圖，商品縮圖與原篩選仍保留，也可返回商品列表。','The basemap cannot start. Product thumbnails and filters are preserved; you can return to the list.'));return;}
  mapRef.current=m;
  let loaded=false;const loadingDeadline=window.setTimeout(()=>{if(!loaded)setMapIssue(say('底圖尚未完整載入，商品與篩選仍保留。可手動重新載入底圖。','The basemap has not finished loading. Products and filters are preserved. Reload the basemap explicitly.'));},15000);
  m.on('load',()=>{loaded=true;window.clearTimeout(loadingDeadline);setMapIssue('');setReady(true);fit();project();});
  m.on('move',project);m.on('movestart',stop);
  m.on('error',()=>setMapIssue(say('地圖底圖暫時無法完整載入，商品與篩選仍保留。','The basemap could not fully load. Products and filters are preserved.')));
  return()=>{window.clearTimeout(loadingDeadline);animations.current.forEach(a=>a.cancel());animations.current=[];m.remove();mapRef.current=null;};
 },[attempt]);
 useEffect(()=>{mapRef.current?.resize();project();},[layout.height,width,selected,frameHeight]);
 useEffect(()=>{
  stop();if(!ready||reduced||!mapRef.current)return;
  const start=document.timeline?.currentTime,sequence=motionSequence.current;
  for(const p of located){const node=positions.get(p.key),element=tiles.current.get(p.key);if(!node||!element||!p.mapLocation)continue;const origin=mapRef.current.project(p.mapLocation.coordinates),x=Math.max(0,Math.min(layout.width-node.size,origin.x+(frame.current?.querySelector('.discovery-map-canvas-scroll')?.scrollLeft??0)-node.size/2)),y=Math.max(0,Math.min(layout.height-node.size,origin.y+(frame.current?.querySelector('.discovery-map-canvas-scroll')?.scrollTop??0)-node.size/2));
   const animation=element.animate([{transform:`translate(${x}px,${y}px)`},{transform:`translate(${node.x}px,${node.y}px)`}],{duration:slow?3600:800,easing:'cubic-bezier(.2,.7,.2,1)'});if(start!==undefined&&start!==null)animation.startTime=start;animations.current.push(animation);
  }
  if(animations.current.length){setAnimating(true);void Promise.all(animations.current.map(a=>a.finished)).then(()=>{if(motionSequence.current===sequence){setAnimating(false);setPaused(false);}}).catch(()=>{});}
  return()=>{motionSequence.current++;animations.current.forEach(a=>a.cancel());animations.current=[];};
 },[signature,ready,reduced,replay,slow]);
 useEffect(()=>onSelection?.(selected),[selected,onSelection]);
 const node=selected?positions.get(selected):undefined;
 const tileRect=selected?tiles.current.get(selected)?.getBoundingClientRect():undefined,frameRect=frame.current?.getBoundingClientRect();
 const anchor=tileRect&&frameRect?[tileRect.left-frameRect.left+tileRect.width/2,tileRect.top-frameRect.top+tileRect.height/2]:node?[node.x+node.size/2,node.y+node.size/2]:null;
 return <section className="discovery-map" aria-label={say('依分類排列的地圖商品','Map products arranged by category')}>
  <div className="discovery-map-intro"><strong>{say(`本批 ${located.length} 張縮圖`,`${located.length} loaded thumbnails`)}</strong><span>{[located.filter(p=>p.kind==='listing').length?say(`站內 ${located.filter(p=>p.kind==='listing').length}`,`${located.filter(p=>p.kind==='listing').length} on-site`):'',located.some(p=>p.kind!=='listing')?say(`公開來源 ${located.filter(p=>p.kind!=='listing').length}`,`${located.filter(p=>p.kind!=='listing').length} public references`):''].filter(Boolean).join(' · ')}</span></div>
  <div className="discovery-map-controls"><button disabled={!ready} onClick={()=>{stop();setInteraction(v=>!v);}}>{interaction?say('捲動畫布','Scroll thumbnails'):say('移動地圖','Pan the map')}</button><button disabled={!ready} onClick={searchHere}>{say('搜尋目前地圖範圍','Search this map area')}</button><button onClick={()=>setInfo(true)}>{say('來源與排列說明','Sources & arrangement')}</button>{animating&&<button disabled={reduced} onClick={()=>{animations.current.forEach(a=>paused?a.play():a.pause());setPaused(p=>!p);}}>{paused?say('繼續排列','Resume arrangement'):say('暫停排列','Pause arrangement')}</button>}</div>
  {!ready&&!mapIssue&&<p role="status" className="discovery-map-note">{say('底圖載入中；商品縮圖和篩選仍可使用。','Loading the basemap; product thumbnails and filters remain available.')}</p>}
  {!located.length&&<div className="discovery-map-error" role="status">{say('這批沒有可放置的公開位置；不代表沒有商品。','This batch has no usable public map locations; it does not mean there are no products.')}{onList&&<button onClick={onList}>{say('返回同條件商品列表','Return to the filtered list')}</button>}</div>}
  {mapIssue&&<div role="alert" className="discovery-map-error">{mapIssue}<button onClick={()=>setAttempt(a=>a+1)}>{say('重新載入底圖','Reload basemap')}</button></div>}
  <div ref={frame} className="discovery-map-frame" style={{height:frameHeight}}>
   <div ref={surface} className="discovery-map-basemap" aria-label={say('真實地圖底圖','Live basemap')}/>
   <div className="discovery-map-canvas-scroll" style={{pointerEvents:interaction?'none':'auto'}} onScroll={()=>{stop();project();}}><div className="discovery-map-canvas" style={{width:layout.width,height:layout.height}}>
   {layout.boxes.map(b=><div key={b.key} className="discovery-map-group" style={{left:b.x,top:b.y,width:b.width,height:b.height}} aria-hidden="true"/>)}

   {layout.headings.map(h=><div key={h.key} className={'discovery-map-heading level-'+h.level} style={{left:h.x,top:h.y,width:h.width,minHeight:h.height}}>{h.label} <span>· {h.count}</span></div>)}
   {located.map(p=>{const n=positions.get(p.key)!;return <button key={p.key} ref={el=>{if(el)tiles.current.set(p.key,el);else tiles.current.delete(p.key);}} className={'discovery-map-thumbnail '+(p.key===selected?'selected':'')} style={{width:n.size,height:n.size,transform:`translate(${n.x}px,${n.y}px)`}} aria-label={say('選取商品：','Select item: ')+p.title} aria-pressed={p.key===selected} data-product-key={p.key} onClick={()=>{if(animating&&!paused){animations.current.forEach(a=>a.pause());setPaused(true);}setSelected(p.key);}}><DiscoveryPhoto key={p.key+':'+(photoAttempts[p.key]??0)} src={p.thumbnailUrl} title={p.title}/></button>;})}
  </div></div>
   {ready&&anchor&&point&&(!animating||paused)&&<svg className="discovery-map-leader" width={width} height={frameHeight} aria-label={say('選取商品連至原概略位置','Selected item connected to its original approximate location')}><line x1={anchor[0]} y1={anchor[1]} x2={point[0]} y2={point[1]} stroke="#006bd6" strokeWidth="2" strokeDasharray="5 3"/><circle cx={point[0]} cy={point[1]} r="8" fill="#006bd6" stroke="white" strokeWidth="3"/></svg>}
  </div>
  <p className="discovery-map-attribution"><a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a></p>
  {selectedItem&&<><button className="discovery-map-preview-jump" onClick={()=>{preview.current?.focus({preventScroll:true});preview.current?.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});}}>{say('查看下方選取商品：','View selected item below: ')}{selectedItem.title}</button><div ref={preview} tabIndex={-1} className="discovery-map-preview"><div className="discovery-map-preview-photo"><DiscoveryPhoto key={selectedItem.key+':'+(photoAttempts[selectedItem.key]??0)} src={selectedItem.thumbnailUrl} title={selectedItem.title}/><ProductWishButton product={selectedItem}/></div><div><strong>{selectedItem.title}</strong><p>{selectedItem.currency==='TWD'&&selectedItem.price!==null?'NT$ '+selectedItem.price.toLocaleString(getDisplayLocale()):selectedItem.priceText||say('價格待確認','Price unconfirmed')}</p><RetailPriceNote retail={selectedItem.retail??selectedItem.cp?.retail} currentPrice={selectedItem.price} currency={selectedItem.currency} unitVerified={selectedItem.priceUnitVerified}/><p>{selectedItem.sourceLabel} · {selectedItem.county} {selectedItem.district}</p><p>{say('藍色標記為原公開概略位置，非商品或賣家地址。','The blue marker shows the original approximate public location, not a product or seller address.')}</p><ProductInterest kind={selectedItem.kind} id={selectedItem.id} compact/><button className="discovery-primary" onClick={()=>onOpen(selectedItem)}>{say('查看商品詳情','View product details')}</button><button className="discovery-map-preview-jump" onClick={()=>setPhotoAttempts(p=>({...p,[selectedItem.key]:(p[selectedItem.key]??0)+1}))}>{say('重新載入這張照片','Reload this photo')}</button></div></div></>}
  {!!unmapped.length&&<details className="discovery-map-unmapped"><summary>{say(`本批另有 ${unmapped.length} 件未顯示在地圖`,`${unmapped.length} loaded items are not placed on the map`)}</summary><p>{say('尚無可用公開位置，或站內商品尚未／不再同意展示；不推測其座標，也不視為位於所選地圖範圍。','No usable public location or current map consent. Coordinates are not inferred, and these items are not claimed to lie within the selected map area.')}</p>{unmapped.map(p=><button key={p.key} onClick={()=>onOpen(p)}>{p.title}</button>)}</details>}
  {page.nextCursor&&<p className="discovery-map-note">{say('尚有符合條件的結果未載入；請使用下方載入更多，不以本批縮圖冒稱全部商品。','More matching results remain unloaded. Use Load more below; these thumbnails are not the full inventory.')}</p>}
  {info&&<MarketplaceDialog title={say('來源與排列說明','Sources & arrangement')} closeLabel={say('關閉地圖說明','Close map information')} onClose={()=>setInfo(false)}><div className="discovery-map-information"><p>{say('縮圖依分類排列，圖片位置已位移。選取商品後，藍色連線會連回原公開概略位置，不是商品或賣家的精確地址。','Thumbnails move into category groups. Selecting one connects it to the original approximate public location, not an exact product or seller address.')}</p><p>{say('畫布可上下、左右捲動。切換「移動地圖」後可平移、縮放底圖；移動或重排不會自動搜尋，請按「搜尋目前地圖範圍」。','Scroll the thumbnail canvas, or choose Pan the map to pan and zoom the basemap. Movement and rearrangement never search automatically. Use Search this map area.')}</p><p>{say(`符合條件的可用地圖位置 ${page.mapTotals?.located??located.length} 筆，本批已載入 ${located.length} 張。未取得位置或目前展示同意的商品另列。公開來源庫存與交易待確認。`,`${page.mapTotals?.located??located.length} matching items have usable map locations; ${located.length} are loaded. Items without a usable location or current consent are listed separately. Public-reference stock and terms remain unconfirmed.`)}</p><div className="discovery-map-controls"><button disabled={!ready} onClick={()=>{setInfo(false);fit();}}>{say('查看本批原位置','Show loaded original locations')}</button><button disabled={reduced||!ready} onClick={()=>{setInfo(false);setSlow(s=>!s);setReplay(n=>n+1);}}>{slow?say('以正常速度重播排列','Replay at normal speed'):say('慢速重播排列','Replay arrangement slowly')}</button></div><p>{say('慢速排列可暫停／繼續；系統開啟減少動態效果時，直接顯示排好結果。照片未提供或讀取失敗時保留商品，不以代表照替代。','Slow arrangements can be paused and resumed. Reduced motion shows the settled layout immediately. Items remain individually available when photos are missing or fail; representative photos never replace them.')}</p></div></MarketplaceDialog>}
 </section>;
}
