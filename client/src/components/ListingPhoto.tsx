import { useEffect, useState } from 'react';
import type {PhotoCompleteness} from '../lib/sourceLeadData';
import {sourceLeadText as text} from '../lib/sourceLeadCopy';
export function ListingPhoto({src,alt,detail=false,onResult}:{src?:string;alt:string;detail?:boolean;onResult?:(result:'ready'|'error')=>void}) {
 const [state,setState]=useState<'loading'|'ready'|'error'>(src?'loading':'error');
 useEffect(()=>setState(src?'loading':'error'),[src]);
 return <div className={detail?'relative aspect-square w-full overflow-hidden bg-stone-100 sm:aspect-video':'relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-100'}>
 {!!src && state!=='error' && <img src={src} alt={alt} referrerPolicy="no-referrer" className={'h-full w-full '+(detail?'object-contain':'object-cover')} onLoad={()=>{setState('ready');onResult?.('ready');}} onError={()=>{setState('error');onResult?.('error');}}/>}
 {state!=='ready' && <div role="status" className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-stone-500">{text(!src?'目前沒有可顯示的商品圖片':state==='error'?'圖片暫時無法載入':'圖片載入中…')}</div>}
 </div>;
}

export function ListingPhotoGallery({photos,title,completeness}:{completeness?:PhotoCompleteness;photos:{id:string;imageUrl:string;thumbnailUrl:string;alt:string}[];title:string}) {
 const [selected,setSelected]=useState<string|null>(null);
 const [results,setResults]=useState<Record<string,'ready'|'error'>>({});
 const imageKey=(p:typeof photos[number])=>p.id+'|'+p.imageUrl;
 const loaded=photos.filter(p=>results[imageKey(p)]==='ready').length;
 const failed=photos.filter(p=>results[imageKey(p)]==='error').length;
 const messages={UNVERIFIED:'來源商品圖片總數尚待核對',INCOMPLETE:'已知來源圖片尚未完整匯入',IMPORTED_COMPLETE:'來源商品圖片已完整收錄',STALE:'圖片完整性需重新核對',OVER_LIMIT:'來源圖片超過目前支援張數，待處理'} as const;
 const current=photos.find(p=>p.id===selected)??photos[0];
 const index=current?photos.findIndex(p=>p.id===current.id):0;
 const move=(offset:number)=>setSelected(photos[(index+offset+photos.length)%photos.length].id);
 return <div data-source-photo-count={completeness?.sourceCount??undefined} data-imported-photo-count={photos.length} data-loaded-photo-count={loaded} data-failed-photo-count={failed}><ListingPhoto key={current?imageKey(current):title} src={current?.imageUrl} alt={current?.alt||title} detail onResult={result=>{if(current)setResults(previous=>({...previous,[imageKey(current)]:result}));}}/>{completeness&&<p role="status" className="text-sm text-stone-600">{text(messages[completeness.status])}{completeness.sourceCount!==null&&text('（來源{source}張／已收錄{imported}張）',{source:completeness.sourceCount,imported:photos.length})}</p>}{completeness?.sourceCount!==undefined&&completeness.sourceCount!==null&&completeness.physicalSourceCount!==null&&<p className="text-xs text-stone-600">{text('實物圖{physical}張／專屬規格或包裝圖{other}張',{physical:completeness.physicalSourceCount,other:completeness.sourceCount-completeness.physicalSourceCount})}</p>}{photos.length>0&&<p className="text-xs text-stone-600">{text('本次已成功查看{loaded}張',{loaded})}{failed>0&&text('，{failed}張載入失敗',{failed})}</p>}{photos.length>0&&<p aria-live="polite" className="text-center text-sm">{text('第{index}張，共{count}張已收錄圖片',{index:index+1,count:photos.length})}</p>}{photos.length>1&&<div className="flex justify-between gap-2 px-3"><button type="button" className="min-h-11 rounded-xl border px-4" aria-label={text('上一張來源照片')} onClick={()=>move(-1)}>{text('上一張')}</button><button type="button" className="min-h-11 rounded-xl border px-4" aria-label={text('下一張來源照片')} onClick={()=>move(1)}>{text('下一張')}</button></div>}{photos.length>1&&<div className="flex gap-2 overflow-x-auto p-3" aria-label={text('原始照片順序')}>{photos.map((p,i)=><button key={p.id} type="button" aria-label={text('查看第{index}張來源照片',{index:i+1})} aria-pressed={current?.id===p.id} onClick={()=>setSelected(p.id)}><ListingPhoto src={p.thumbnailUrl} alt={p.alt}/></button>)}</div>}</div>;
}
