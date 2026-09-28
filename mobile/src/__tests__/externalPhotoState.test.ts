import { describe, expect, it } from 'vitest';
import { externalPhotoPresentation } from '../externalPhotoState';

describe('external detail photo presentation', () => {
  it('shows a loading explanation until either remote image loads', () => {
    expect(externalPhotoPresentation('loading', 'loading')).toMatchObject({ visible: 'placeholder', label: '來源商品圖片載入中' });
  });

  it('shows the cached thumbnail while the larger source is still loading', () => {
    expect(externalPhotoPresentation('loaded', 'loading')).toMatchObject({ visible: 'thumbnail', label: '來源商品圖片，縮圖已載入' });
  });

  it('keeps the thumbnail and explains a high-resolution source failure', () => {
    expect(externalPhotoPresentation('loaded', 'failed')).toMatchObject({ visible: 'thumbnail', label: '來源商品圖片，顯示縮圖' });
  });

  it('shows the original when it loads, even if the thumbnail failed', () => {
    expect(externalPhotoPresentation('failed', 'loaded')).toMatchObject({ visible: 'original', label: '來源商品圖片' });
  });

  it('never presents a blank frame as a successfully loaded image', () => {
    expect(externalPhotoPresentation('failed', 'failed')).toMatchObject({ visible: 'placeholder', label: '來源商品圖片無法載入' });
  });
});
