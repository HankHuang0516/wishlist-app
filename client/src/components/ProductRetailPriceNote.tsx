import {useEffect,useState} from 'react';
import {publicApi} from '../lib/marketplaceApi';
import {parseDiscovery,type DiscoveryProduct} from '../lib/discovery';
import RetailPriceNote from './RetailPriceNote';

export default function ProductRetailPriceNote({kind,id,title,price,priceText}:{
  kind:DiscoveryProduct['kind'];id:string;title:string;price?:number;priceText?:string;
}) {
  const [current,setCurrent]=useState<{key:string;product:DiscoveryProduct}|null>(null);
  const key=JSON.stringify([kind,id,title,price,priceText]);
  useEffect(()=>{
    const controller=new AbortController();let alive=true;setCurrent(null);
    void publicApi<unknown>('/discovery/products/'+kind+'/'+id,{signal:controller.signal}).then(value=>{
      const p=parseDiscovery(value).items[0];
      if(alive&&p?.kind===kind&&p.id===id&&p.key===kind+':'+id&&p.title===title&&
         (price!==undefined?p.price===price:priceText!==undefined&&p.priceText===priceText))setCurrent({key,product:p});
    }).catch(()=>{ /* Missing optional evidence never blocks the product itself. */ });
    return()=>{alive=false;controller.abort();};
  },[kind,id,title,price,priceText,key]);
  const p=current?.key===key?current.product:undefined;
  return p?<RetailPriceNote retail={p.retail} currentPrice={p.price} currency={p.currency} unitVerified={p.priceUnitVerified}/>:null;
}
