import { useState } from 'react';
import type { ExternalListing } from '../lib/externalListingSearch';
import { exploreText as text } from '../lib/exploreCopy';

type LoadState = 'loading' | 'loaded' | 'failed';

export default function ExternalDetailPhoto({ item }: { item: ExternalListing }) {
  return <PhotoSession key={JSON.stringify([item.id, item.imageUrl, item.thumbnailUrl])} item={item} />;
}

function PhotoSession({ item }: { item: ExternalListing }) {
  const [thumbnail, setThumbnail] = useState<LoadState>('loading');
  const [original, setOriginal] = useState<LoadState>('loading');
  const visible = original === 'loaded' ? 'original' : thumbnail === 'loaded' ? 'thumbnail' : 'placeholder';
  const failed = thumbnail === 'failed' && original === 'failed';
  const label = visible === 'original' ? '來源商品圖片' : visible === 'thumbnail'
    ? original === 'failed' ? '來源商品圖片，顯示縮圖' : '來源商品圖片，縮圖已載入'
    : failed ? '來源商品圖片無法載入' : '來源商品圖片載入中';
  return <div className="space-y-2">
    <div className="relative h-80 w-full overflow-hidden rounded-xl bg-gray-100">
      <div role="img" aria-label={`${item.title} · ${text(label)}`} className="absolute inset-0">
      <img src={item.thumbnailUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer" decoding="async"
        className={`absolute inset-0 h-full w-full object-contain ${visible === 'thumbnail' ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setThumbnail('loaded')} onError={() => setThumbnail('failed')} />
      <img src={item.imageUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer" decoding="async"
        className={`absolute inset-0 h-full w-full object-contain ${visible === 'original' ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setOriginal('loaded')} onError={() => setOriginal('failed')} />
      </div>
      {visible === 'placeholder' && <p role="status" className="flex h-full items-center justify-center p-4 text-center text-sm text-gray-600">
        {text(failed ? '照片暫時無法載入，仍可前往來源網站確認商品。' : '照片載入中…')}
      </p>}
    </div>
    {visible === 'thumbnail' && original === 'failed' && <p role="status" className="text-sm text-gray-600">
      {text('高畫質照片暫時無法載入，目前顯示縮圖')}
    </p>}
  </div>;
}
