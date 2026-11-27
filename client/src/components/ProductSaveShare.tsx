import { Share2 } from 'lucide-react';
import type { ShareProductKind } from '../../../mobile/shared/shareText';
import { productShareContent, useShareText } from '../lib/useShareText';
import { getDisplayLocale } from '../utils/localization';
import ProductWishButton, { ProductWishStatus } from './ProductWishButton';
import ShareManualText from './ShareManualText';

const say = (zh: string, en: string) => getDisplayLocale().startsWith('zh') ? zh : en;

/** The two things every product's own page or dialog offers, in the same place on each: keep it in a wishlist, and
 *  share it as text with the address of its page. The app's product pages carry the same pair. */
export default function ProductSaveShare({ product, price, version, withWish = true }: { product: { kind: ShareProductKind; id: string; title: string }; price: string; version?: number; withWish?: boolean }) {
  const share = useShareText(), content = productShareContent(product, price, version);
  return <section aria-label={withWish ? say('收藏與分享', 'Save and share') : say('分享商品', 'Share item')} className="space-y-2">
    <div className="flex flex-wrap gap-2">
      {withWish && <ProductWishButton variant="labeled" product={product} />}
      {content && <button type="button" disabled={share.busy} onClick={() => void share.share(content)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 text-stone-900 disabled:opacity-50"><Share2 className="h-5 w-5" aria-hidden="true" />{share.busy ? say('正在分享…', 'Sharing…') : say('分享商品', 'Share item')}</button>}
    </div>
    {withWish && <ProductWishStatus />}
    {share.notice && <p role="status" className="text-sm text-stone-600">{share.notice}</p>}
    {share.manual && content && <ShareManualText content={content} />}
  </section>;
}
