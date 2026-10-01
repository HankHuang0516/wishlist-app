import { useEffect,useRef,useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import MarketplaceDialog from './MarketplaceDialog';
import { getImageUrl } from '../utils/image';
import { t } from '../utils/localization';
import { detailItemBody,detailItemText as text,detailText,safeDetailLink,type DetailItemDraft,type LegacyDetailItem } from '../lib/legacyDetailWeb';

interface Props {
  isOpen:boolean;onClose:()=>void;item:LegacyDetailItem;isOwner?:boolean;wisherName?:string;wisherId?:number;
  busy:boolean;locked:boolean;issue:string;notice:string;
  onSave:(body:ReturnType<typeof detailItemBody>)=>Promise<boolean>;onDelete:()=>void;onClone:()=>void;
}
const draft=(item:LegacyDetailItem):DetailItemDraft=>({name:item.name,notes:item.notes??'',link:item.link??'',price:item.price??'',currency:item.currency??'TWD',budget:item.maxPrice===undefined?'':String(item.maxPrice),budgetCurrency:item.priceCurrency??'TWD'});

/** The parent owns all mutations and recovery. This dialog never calls an API. */
export default function ItemDetailModal({isOpen,onClose,item,isOwner,wisherName,wisherId,busy,locked,issue,notice,onSave,onDelete,onClone}:Props) {
  const [editing,setEditing]=useState(false),[form,setForm]=useState(()=>draft(item)),[error,setError]=useState(''),[submitted,setSubmitted]=useState(false),[zoom,setZoom]=useState(false);
  const active=useRef(true),sending=useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  if(!isOpen)return null;
  async function save() {
    if(!isOwner || locked || busy || sending.current)return;sending.current=true;setError('');setSubmitted(true);
    let body:ReturnType<typeof detailItemBody>;
    try {body=detailItemBody(form);}
    catch(failure){if(active.current)setError(failure instanceof Error?failure.message:text('invalid'));sending.current=false;return;}
    try {const confirmed=await onSave(body);if(active.current && confirmed)setEditing(false);}
    catch{if(active.current)setError(text('unknown'));}
    finally{sending.current=false;}
  }
  if(zoom && item.imageUrl)return <MarketplaceDialog key="image" title={text('zoom')+' · '+item.name} onClose={()=>setZoom(false)} closeLabel={t('common.close')}><img src={getImageUrl(item.imageUrl)} alt={item.name} className="max-h-[75dvh] w-full object-contain"/></MarketplaceDialog>;
  const reference=safeDetailLink(item.link),ai=safeDetailLink(item.aiLink),search='https://www.google.com/search?tbm=shop&q='+encodeURIComponent(item.name);
  const field=(name:keyof DetailItemDraft,label:string,props:Record<string,unknown>={})=><label className="block space-y-1"><span className="text-sm font-medium">{label}</span><Input value={form[name]} onChange={e=>setForm(old=>({...old,[name]:e.target.value}))} disabled={locked || busy} {...props}/></label>;
  return <MarketplaceDialog key="detail" title={editing?text('edit')+' · '+item.name:item.name} onClose={onClose} closeDisabled={busy} closeLabel={t('common.close')}>
    <div className="space-y-4">
      {item.aiError?.includes('403') && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700"><strong>{text('blocked')}</strong><p>{text('blockedHelp')}</p></div>}
      {item.imageUrl && <button type="button" aria-label={text('zoom')} onClick={()=>setZoom(true)} className="min-h-11 w-full rounded-xl bg-gray-50 p-2"><img src={getImageUrl(item.imageUrl)} alt={item.name} className="mx-auto max-h-56 object-contain"/></button>}
      {item.aiStatus!=='UNAVAILABLE' && <p className="text-sm text-muji-secondary">{item.aiStatus==='COMPLETED'?t('ai.complete'):item.aiStatus==='FAILED'?t('ai.failed'):item.aiStatus==='SKIPPED'?text('aiSkipped'):t('ai.analyzing')}</p>}
      {wisherName && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 p-3 text-sm"><span>{text('wisher')}: {wisherName}</span>{wisherId && <Link className="inline-flex min-h-11 items-center text-blue-700 underline" to={'/users/'+wisherId+'/profile'}>{text('profile')}</Link>}</div>}
      {editing?<>
        {field('name',text('name'),{maxLength:200})}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{field('price',text('price'),{inputMode:'decimal'})}{field('currency',text('currency'),{maxLength:3})}{field('budget',text('budget'),{inputMode:'decimal'})}{field('budgetCurrency',text('budgetCurrency'),{maxLength:3})}</div>
        {field('link',text('link'),{inputMode:'url'})}
        <label className="block space-y-1"><span className="text-sm font-medium">{text('notes')}</span><textarea className="min-h-24 w-full rounded-xl border p-3" value={form.notes} onChange={e=>setForm(old=>({...old,notes:e.target.value}))} disabled={locked || busy} maxLength={1000}/></label>
      </>:<>
        <dl className="space-y-3"><div><dt className="text-sm text-muji-secondary">{text('price')}</dt><dd>{item.price===undefined?text('missing'):item.price+' '+(item.currency??text('missing'))}</dd></div><div><dt className="text-sm text-muji-secondary">{text('budget')}</dt><dd>{item.maxPrice===undefined?text('missing'):item.maxPrice.toLocaleString(undefined,{maximumFractionDigits:2})+' '+(item.priceCurrency??text('missing'))}</dd></div><div><dt className="text-sm text-muji-secondary">{text('notes')}</dt><dd className="whitespace-pre-wrap break-words">{item.notes || text('noNotes')}</dd></div></dl>
        <div className="flex flex-col gap-2">{reference && <a className="inline-flex min-h-11 items-center text-blue-700 underline" href={reference} target="_blank" rel="noopener noreferrer">{text('link')}</a>}<a className="inline-flex min-h-11 items-center text-green-700 underline" href={ai??search} target="_blank" rel="noopener noreferrer">{ai?text('aiLink'):text('search')}</a></div>
      </>}
      {error && <p role="alert">{error}</p>}{issue && <p role="alert">{issue}</p>}{submitted && notice && <p role="status">{notice}</p>}
      <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
        {editing?<><Button variant="secondary" className="min-h-11" disabled={busy} onClick={()=>{setEditing(false);setError('');}}>{t('common.cancel')}</Button><Button className="min-h-11" disabled={locked || busy} onClick={()=>void save()}>{t('common.save')}</Button></>:isOwner?<><Button variant="outline" className="min-h-11" disabled={locked || busy} onClick={()=>{setForm(draft(item));setError('');setSubmitted(false);setEditing(true);}}>{text('edit')}</Button><Button variant="destructive" className="min-h-11" disabled={locked || busy} onClick={onDelete}>{detailText('remove')}</Button></>:<Button className="min-h-11" disabled={locked || busy} onClick={onClone}>{detailText('clone')}</Button>}
      </div>
    </div>
  </MarketplaceDialog>;
}
