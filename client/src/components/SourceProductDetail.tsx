import ProductInterest from './ProductInterest';
import ProductRetailPriceNote from './ProductRetailPriceNote';
import { MapPin, Info } from 'lucide-react';
import { ListingPhotoGallery } from './ListingPhoto';
import OriginalSourceLink from './OriginalSourceLink';
import { sourceLeadPrice } from '../lib/sourceLeadPrice';
import { sourceLeadText as text, sourceLeadRoutingReason } from '../lib/sourceLeadCopy';
import { isLocatedLead, sourceLocationLabel, type SourceLead } from '../lib/sourceLeadData';

export default function SourceProductDetail({ item }: { item: SourceLead }) {
  return <article className="min-w-0 space-y-6">
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium"><span className="rounded-full bg-stone-100 px-3 py-1.5 text-stone-700">{text('外部來源商品')}</span><span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-900">{text('庫存待確認')}</span></div>
      <h3 className="break-words text-2xl font-bold leading-snug text-stone-900 sm:text-3xl">{item.title}</h3>
      <OriginalSourceLink url={item.canonicalUrl} />
      <div className="rounded-2xl bg-stone-50 p-4"><p className="mb-1 text-xs font-medium text-stone-500">{text('原文價格資訊')}</p><p className="break-words text-xl font-bold leading-relaxed text-green-800">{sourceLeadPrice(item.publicFacts?.priceText)}</p><ProductRetailPriceNote kind="source" id={item.id} title={item.title} priceText={item.publicFacts?.priceText}/><p className="mt-1 text-xs text-stone-600">{text('價格、現貨與交易條件請以原賣家確認為準。')}</p></div>
    </header>
    <ProductInterest kind="source" id={item.id}/><div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className="min-w-0" aria-label={text('商品照片')}><ListingPhotoGallery photos={item.media ?? []} title={item.title} completeness={item.photoCompleteness} /></section>
      <div className="min-w-0 space-y-5">
        <section className="space-y-2"><h4 className="font-semibold text-stone-900">{text('商品說明')}</h4><p className="whitespace-pre-wrap break-words text-sm leading-7 text-stone-700">{item.summary}</p></section>
        <section className="rounded-2xl border border-stone-200 p-4"><h4 className="mb-2 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" aria-hidden="true" />{text('地點資訊')}</h4><p className="text-sm leading-6 text-stone-700">{isLocatedLead(item) ? item.county + ' · ' + item.district : text(sourceLocationLabel(item))}</p>{isLocatedLead(item) && <><p className="mt-1 text-sm leading-6 text-stone-600">{text(sourceLocationLabel(item))}：{item.publicPlaceName}</p><p className="mt-1 text-xs leading-5 text-stone-500">{text('不是商品或賣家所在地。')}</p></>}</section>
        <section className="space-y-2 border-t border-stone-100 pt-4"><h4 className="font-semibold">{text('來源資訊')}</h4>{item.publicFacts?.originalDateLabel && <p className="text-sm leading-6 text-stone-600">{item.publicFacts.originalDateLabel}</p>}{item.publicFacts?.sourceAccessNotice && <p className="text-xs leading-5 text-stone-500">{item.publicFacts.sourceAccessNotice}</p>}</section>
      </div>
    </div>
    <aside className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm leading-6 text-stone-700"><h4 className="mb-2 flex items-center gap-2 font-semibold text-stone-900"><Info className="h-4 w-4" aria-hidden="true" />{text('透過 Wishlist AI 詢問')}</h4><p>{text('外部來源 · Wishlist AI代問，非站內賣家；庫存與交易待確認。')}</p><p role="status" className="mt-2 text-xs leading-5 text-stone-600">{sourceLeadRoutingReason(item.contactRouting)}</p></aside>
  </article>;
}
