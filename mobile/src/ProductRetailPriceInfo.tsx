import React,{useEffect,useState} from 'react';
import {createApi} from './api';
import {parseNativeDiscovery,type DiscoveryProduct} from './discoveryData';
import {RetailPriceInfo} from './RetailPriceInfo';

// Details opened from the map or a deep link need fresh, model-bound evidence too.
export function ProductRetailPriceInfo({api,apiUrl,kind,id,title,price,priceText}:{
  api:ReturnType<typeof createApi>;apiUrl:string;kind:DiscoveryProduct['kind'];id:string;
  title:string;price?:number;priceText?:string;
}) {
  const [current,setCurrent]=useState<{key:string;product:DiscoveryProduct}|null>(null);
  const key=JSON.stringify([kind,id,title,price,priceText]);
  useEffect(()=>{
    const controller=new AbortController();let alive=true;setCurrent(null);
    void api<unknown>('/discovery/products/'+kind+'/'+id,{signal:controller.signal})
      .then(value=>{
        const p=parseNativeDiscovery(value,apiUrl,__DEV__).items[0];
        if(alive&&p?.kind===kind&&p.id===id&&p.title===title&&
           (price!==undefined?p.price===price:priceText!==undefined&&p.priceText===priceText))
          setCurrent({key,product:p});
      }).catch(()=>{ /* Optional evidence unavailable: keep the actual product usable. */ });
    return()=>{alive=false;controller.abort();};
  },[api,apiUrl,key]);
  const p=current?.key===key?current.product:undefined;
  return p?<RetailPriceInfo price={p.price} currency={p.currency} unitVerified={p.priceUnitVerified} reference={p.retail}/>:null;
}
