import { ArrowUpRight, Info } from 'lucide-react';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import MarketplaceDialog from './MarketplaceDialog';
import { getDisplayLocale } from '../utils/localization';
import type {RetailPriceReference,RetailConversion} from '../lib/discovery';
import { retailComparison, retailComparisonLabel } from '../lib/retailComparison';
import './RetailPriceNote.css';
const say=(zh:string,en:string)=>getDisplayLocale().startsWith('zh')?zh:en;
export default function RetailPriceNote({ retail, conversion, currentPrice, currency, unitVerified }: {
  retail?: RetailPriceReference; conversion?: RetailConversion; currentPrice?: number | null; currency?: string | null; unitVerified?: boolean;
}) {
  const identity=JSON.stringify([retail?.sourceUrl,retail?.price,retail?.checkedAt,currentPrice,currency,unitVerified]);
  const [open,setOpen]=useState<string|null>(null);
  useEffect(()=>setOpen(null),[identity]);
  const comparison = retailComparison(retail, conversion, currentPrice, currency, unitVerified);
  if (!retail || !comparison) return null;
  return <div className="discovery-retail-price">
    <button type="button" className="discovery-retail-trigger" aria-haspopup="dialog" aria-expanded={open===identity} onClick={event=>{event.stopPropagation();setOpen(identity);}}>{retailComparisonLabel(comparison.ratio, comparison.free, getDisplayLocale())}<Info size={16} aria-hidden="true"/></button>
    {open===identity&&createPortal(<div onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}><MarketplaceDialog title={say('參考原價與來源','Reference original price & source')} closeLabel={say('關閉原價參考','Close price reference')} onClose={()=>setOpen(null)}>
    <div className="discovery-retail-details" data-testid="retail-price-evidence">
      <p><strong>{retailComparisonLabel(comparison.ratio,comparison.free,getDisplayLocale())}</strong></p>
      {currentPrice!==undefined&&currentPrice!==null&&<p>{say('商品售價','Asking price')} NT$ {currentPrice.toLocaleString(getDisplayLocale(),{maximumFractionDigits:2})}</p>}
      <p>{say('參考原價','Reference original price')} <strong>NT$ {retail.price.toLocaleString(getDisplayLocale(), {maximumFractionDigits:2})}</strong></p>
      <p>{retail.priceType==='MANUFACTURER_MSRP'?say('原廠建議售價','Manufacturer MSRP'):say('新品一般售價','Regular new retail price')}</p>
      {retail.sourceProductTitle&&<p>{say('參考型號／規格：','Reference model/specification: ')}{retail.sourceProductTitle}</p>}
      <p>{retail.sourceTitle}</p>
      <a href={retail.sourceUrl} target="_blank" rel="noopener noreferrer">{retail.priceType==='MANUFACTURER_MSRP'?say('原廠建議售價依據','Manufacturer MSRP source'):say('新品一般售價依據','Regular new retail source')}<ArrowUpRight size={14}/></a>
      <small>{retail.sourcePeriod?say(`原價資料期：${retail.sourcePeriod} · `,`Source period: ${retail.sourcePeriod} · `):''}{say('查核：','Checked: ')}{new Date(retail.checkedAt).toLocaleDateString(getDisplayLocale())}</small>
      <p>{say('以同型號／規格的參考原價比較；可能為上市建議售價，不代表目前最低新品價，也不保證品況、庫存或成交。','Comparison uses a same-model/specification reference price, which may be launch MSRP rather than today’s lowest new price. It does not guarantee condition, availability or a transaction.')}</p>
    </div></MarketplaceDialog></div>,document.body)}
  </div>;
}
