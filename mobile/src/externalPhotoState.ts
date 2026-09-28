export type ExternalPhotoLoadState = 'loading' | 'loaded' | 'failed';

export function externalPhotoPresentation(thumbnail: ExternalPhotoLoadState, original: ExternalPhotoLoadState) {
  if (original === 'loaded') return { visible: 'original' as const, label: '來源商品圖片', hint: null };
  if (thumbnail === 'loaded') return {
    visible: 'thumbnail' as const,
    label: original === 'failed' ? '來源商品圖片，顯示縮圖' : '來源商品圖片，縮圖已載入',
    hint: original === 'failed' ? '高畫質照片暫時無法載入，目前顯示縮圖' : null,
  };
  if (thumbnail === 'failed' && original === 'failed') return {
    visible: 'placeholder' as const, label: '來源商品圖片無法載入', hint: '照片暫時無法載入',
  };
  return { visible: 'placeholder' as const, label: '來源商品圖片載入中', hint: '照片載入中…' };
}
