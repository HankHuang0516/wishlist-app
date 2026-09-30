import { useEffect, useState } from 'react';
import { API_URL } from '../config';
import { isUuid } from '../lib/listingBatch';
export default function PrivatePhoto({ id, token, label = '僅本人可見的商品照片' }: { id: string; token: string; label?: string }) {
  const [image, setImage] = useState<{ source: string; url: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const source = `${id}:${token}`;
  useEffect(() => {
    if (!isUuid(id)) return;
    const controller = new AbortController();
    let objectUrl = '';
    void fetch(`${API_URL}/listing-media/${id}/thumbnail`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('PHOTO_UNAVAILABLE'); return response.blob(); })
      .then(blob => { if (controller.signal.aborted) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || blob.size > 5 * 1024 * 1024) throw new Error('PHOTO_INVALID');
        objectUrl = URL.createObjectURL(blob); setImage({ source, url: objectUrl }); })
      .catch(() => { if (!controller.signal.aborted) { setImage(null); setFailed(source); } });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, token, source]);
  return image?.source === source ? <img src={image.url} alt={label} className="h-32 w-full max-w-32 rounded-2xl object-cover" />
    : <div role="img" aria-label={`${label}：${failed === source ? '照片暫時無法載入' : '照片載入中'}`} className="flex h-32 w-full max-w-32 items-center justify-center rounded-2xl bg-stone-100 text-sm text-stone-500">{failed === source ? '照片暫時無法載入' : '照片載入中'}</div>;
}
