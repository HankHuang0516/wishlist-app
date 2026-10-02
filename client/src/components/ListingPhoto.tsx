import { useEffect, useState } from 'react';
export function ListingPhoto({src,alt,detail=false}:{src?:string;alt:string;detail?:boolean}) {
 const [state,setState]=useState<'loading'|'ready'|'error'>(src?'loading':'error');
 useEffect(()=>setState(src?'loading':'error'),[src]);
 return <div className={detail?'relative aspect-square w-full overflow-hidden bg-stone-100 sm:aspect-video':'relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-100'}>
 {!!src && state!=='error' && <img src={src} alt={alt} referrerPolicy="no-referrer" className={'h-full w-full '+(detail?'object-contain':'object-cover')} onLoad={()=>setState('ready')} onError={()=>setState('error')}/>}
 {state!=='ready' && <div role="status" className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-stone-500">{!src?'原圖尚未取得展示許可':state==='error'?'圖片暫時無法載入':'圖片載入中…'}</div>}
 </div>;
}

export function ListingPhotoGallery({photos,title}:{photos:{id:string;imageUrl:string;thumbnailUrl:string;alt:string}[];title:string}) {
 const [selected,setSelected]=useState<string|null>(null);
 const current=photos.find(p=>p.id===selected)??photos[0];
 return <div><ListingPhoto key={current?.id||title} src={current?.imageUrl} alt={current?.alt||title} detail/>{photos.length>1&&<div className="flex gap-2 overflow-x-auto p-3" aria-label="原始照片順序">{photos.map((p,i)=><button key={p.id} type="button" aria-label={`查看第${i+1}張來源照片`} aria-pressed={current?.id===p.id} onClick={()=>setSelected(p.id)}><ListingPhoto src={p.thumbnailUrl} alt={p.alt}/></button>)}</div>}</div>;
}
