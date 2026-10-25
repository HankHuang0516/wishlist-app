import ProductInterest from './ProductInterest';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Image as ImageIcon, MapPin } from 'lucide-react';
import type { DiscoveryProduct } from '../lib/discovery';
import { getDisplayLocale } from '../utils/localization';
import OriginalSourceLink from './OriginalSourceLink';
import RetailPriceNote from './RetailPriceNote';
const say = (zh: string, en: string) => getDisplayLocale().startsWith('zh') ? zh : en;
const price = (item: DiscoveryProduct) => item.price !== null && item.currency==='TWD' ? 'NT$ ' + new Intl.NumberFormat(getDisplayLocale(), { maximumFractionDigits: 2 }).format(item.price) : item.priceText || say('價格待詢問', 'Ask for price');
const condition = (item: DiscoveryProduct) => item.condition === 'NEW' ? say('全新', 'New') : item.condition === 'USED' ? say('二手', 'Used') : say('狀況待確認', 'Condition unconfirmed');
export function DiscoveryPhoto({ src, title }: { src: string | null; title: string }) {
  return <PhotoImage key={src ?? 'no-photo'} src={src} title={title} />;
}
function PhotoImage({ src, title }: { src: string | null; title: string }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? <img src={src} alt={title} loading="lazy" onError={() => setBroken(true)} /> : <div className="discovery-image-fallback"><ImageIcon size={32} aria-hidden="true" /><small>{say('尚無可用照片', 'Photo unavailable')}</small></div>;
}

export function DiscoveryProductActions({ item }: { item: DiscoveryProduct }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-stone-500">{item.kind === 'source' ? say('代問不會下訂或付款。', 'An inquiry does not place an order or make a payment.') : say('交易條件請與原賣家確認。', 'Confirm transaction terms with the seller.')}</p><Link className="discovery-primary" to={item.kind === 'listing' ? item.detailPath : '/chat?' + (item.kind === 'source' ? 'source=' : 'external=') + item.id}>{item.kind === 'listing' ? say('查看刊登與聯絡賣家', 'View listing & contact') : item.kind === 'source' ? say('請 Wishlist AI 代問', 'Ask Wishlist AI to inquire') : say('詢問商品', 'Ask about this product')}</Link></div>;
}
export default function DiscoveryProductDetail({ item }: { item: DiscoveryProduct }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const header=<header className="space-y-3"><div className="flex flex-wrap gap-2 text-xs font-medium"><span className="rounded-full bg-stone-100 px-3 py-1.5 text-stone-700">{item.kind === 'listing' ? say('站內刊登', 'On-site listing') : say('外部來源商品', 'External-source item')}</span>{item.kind !== 'listing' && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-900">{say('庫存待確認', 'Stock unconfirmed')}</span>}</div><h3 className="break-words text-2xl font-bold leading-snug text-stone-900 sm:text-3xl">{item.title}</h3>{item.canonicalUrl && <OriginalSourceLink url={item.canonicalUrl} />}<div className="rounded-2xl bg-stone-50 p-4"><p className="mb-1 text-xs text-stone-500">{say('商品價格', 'Item price')}</p><strong className="discovery-detail-price text-green-800">{price(item)}</strong><RetailPriceNote retail={item.retail??item.cp?.retail} currentPrice={item.price} currency={item.currency} unitVerified={item.priceUnitVerified}/>{item.kind !== 'listing' && <p className="mt-1 text-xs leading-5 text-stone-600">{say('價格、現貨與交易條件請以原賣家確認為準。', 'Confirm the price, availability and terms with the original seller.')}</p>}</div></header>;
  return <article className="discovery-detail discovery-product-detail">
    {item.kind!=='listing'&&<>{header}<ProductInterest kind={item.kind} id={item.id}/></>}

    <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className="min-w-0 space-y-3" aria-label={say('商品照片', 'Item photos')}><div className="discovery-detail-photo"><DiscoveryPhoto src={item.photos[photoIndex]?.url ?? item.thumbnailUrl} title={item.title} />{item.photos.length > 1 && <><button className="photo-prev" aria-label={say('上一張照片', 'Previous photo')} disabled={photoIndex === 0} onClick={() => setPhotoIndex(i => i - 1)}><ArrowLeft size={20} /></button><button className="photo-next" aria-label={say('下一張照片', 'Next photo')} disabled={photoIndex >= item.photos.length - 1} onClick={() => setPhotoIndex(i => i + 1)}><ArrowRight size={20} /></button><span aria-live="polite">{photoIndex + 1} / {item.photos.length}</span></>}</div>{item.photos.length > 1 && <div className="discovery-detail-thumbs">{item.photos.map((m, i) => <button key={m.id} aria-label={say(`第 ${i+1} 張照片`, `Photo ${i+1}`)} aria-pressed={photoIndex === i} onClick={() => setPhotoIndex(i)}><DiscoveryPhoto src={m.thumbnailUrl} title="" /></button>)}</div>}</section>
      <div className="min-w-0 space-y-5">{item.kind==='listing'&&<>{header}<ProductInterest kind={item.kind} id={item.id}/></>}<section className="space-y-2"><h4 className="font-semibold text-stone-900">{say('商品說明', 'Item description')}</h4><p className="discovery-detail-description">{item.description}</p></section><section className="rounded-2xl border border-stone-200 p-4"><h4 className="mb-2 flex items-center gap-2 font-semibold"><MapPin size={16} aria-hidden="true" />{say('狀況與地點', 'Condition & location')}</h4><p className="text-sm leading-6 text-stone-700">{condition(item)} · {item.county ?? say('地區待確認', 'Area unconfirmed')}{item.district ? ' ' + item.district : ''}</p>{item.kind !== 'listing' && <p className="mt-1 text-xs leading-5 text-stone-500">{say('概略地區，非精確取貨點；面交或寄送方式需與原賣家確認。', 'Approximate area, not an exact pickup point. Confirm collection or shipping with the seller.')}</p>}</section><section className="space-y-2 border-t border-stone-100 pt-4"><h4 className="font-semibold">{say('來源與日期', 'Source & date')}</h4><p className="text-xs leading-6 text-stone-600">{say('時間依據：', 'Date basis: ')}{item.dateBasis === 'PUBLISHED' ? say('站內發布', 'On-site publication') : item.dateBasis === 'SOURCE_POST_RANGE' ? say('原貼文時間範圍', 'Original post date range') : say('收錄時間，非新上架證明', 'Collection date, not proof of a new listing')} · {item.dateBasis === 'SOURCE_POST_RANGE' && item.dateEarliest && item.dateEarliest !== item.date ? new Date(item.dateEarliest).toLocaleDateString(getDisplayLocale()) + '–' : ''}{new Date(item.date).toLocaleDateString(getDisplayLocale())}</p></section></div>
    </div>
    <p className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm leading-6 text-stone-700">{item.kind === 'listing' ? say('站內刊登；交易條件請與賣家確認。', 'On-site listing. Confirm terms with the seller.') : say('公開來源參考，庫存與交易待確認；地區為概略資訊。', 'Public reference. Stock and terms unconfirmed; location is approximate.')}</p>

  </article>;
}
