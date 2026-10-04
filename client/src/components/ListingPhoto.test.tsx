import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {ListingPhoto,ListingPhotoGallery} from './ListingPhoto';
let originalLocale:string|null;
beforeEach(()=>{originalLocale=localStorage.getItem('user-locale');localStorage.setItem('user-locale','zh-TW')});
afterEach(()=>{cleanup();if(originalLocale===null)localStorage.removeItem('user-locale');else localStorage.setItem('user-locale',originalLocale)});
describe('shared listing photo presentation',()=>{
 it('reports missing imported media without inventing a permission decision',()=>{render(<ListingPhoto alt="鍋具"/>);expect(screen.queryByRole('img')).toBeNull();expect(screen.getByRole('status').textContent).toContain('沒有可顯示');});
 it('shows loading and network failure, resets for the next item and keeps square cover thumbnails',()=>{const v=render(<ListingPhoto src="https://example.invalid/a.jpg" alt="a"/>);expect(screen.getByRole('status').textContent).toContain('載入中');fireEvent.error(screen.getByRole('img'));expect(screen.queryByRole('img')).toBeNull();expect(screen.getByRole('status').textContent).toContain('暫時無法載入');v.rerender(<ListingPhoto src="https://example.invalid/b.jpg" alt="b"/>);const img=screen.getByRole('img');expect(img.className).toContain('object-cover');fireEvent.load(img);expect(screen.queryByRole('status')).toBeNull();});
 it('preserves original sequence and fits the original detail image without crop',()=>{const photos=[{id:'a',imageUrl:'https://example.invalid/a.jpg',thumbnailUrl:'https://example.invalid/at.jpg',alt:'第一張'},{id:'b',imageUrl:'https://example.invalid/b.jpg',thumbnailUrl:'https://example.invalid/bt.jpg',alt:'第二張'}];render(<ListingPhotoGallery photos={photos} title="鍋具"/>);expect(screen.getAllByRole('img')[0].className).toContain('object-contain');fireEvent.click(screen.getByRole('button',{name:'查看第2張來源照片'}));expect(screen.getAllByRole('img')[0].getAttribute('src')).toBe(photos[1].imageUrl);expect(screen.getByText('第2張，共2張已收錄圖片')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'下一張來源照片'}));expect(screen.getAllByRole('img')[0].getAttribute('src')).toBe(photos[0].imageUrl);fireEvent.click(screen.getByRole('button',{name:'上一張來源照片'}));expect(screen.getAllByRole('img')[0].getAttribute('src')).toBe(photos[1].imageUrl);});
 it('does not equate imported complete with successful image loading, and resets for replacement',()=>{
  const photos=[{id:'a',imageUrl:'https://example.invalid/a.jpg',thumbnailUrl:'https://example.invalid/at.jpg',alt:'第一張'}];
  const v=render(<ListingPhotoGallery photos={photos} title="鍋具" completeness={{status:'IMPORTED_COMPLETE',sourceCount:1,physicalSourceCount:1,importedCount:1,limit:32}}/>);
  expect(screen.getByText('來源商品圖片已完整收錄（來源1張／已收錄1張）')).toBeTruthy();expect(screen.getByText('本次已成功查看0張')).toBeTruthy();fireEvent.error(screen.getByRole('img'));expect(screen.getByText('本次已成功查看0張，1張載入失敗')).toBeTruthy();
  v.rerender(<ListingPhotoGallery photos={[{...photos[0],imageUrl:'https://example.invalid/replaced.jpg'}]} title="鍋具" completeness={{status:'STALE',sourceCount:1,physicalSourceCount:1,importedCount:1,limit:32}}/>);expect(screen.getByText('本次已成功查看0張')).toBeTruthy();fireEvent.load(screen.getByRole('img'));expect(screen.getByText('本次已成功查看1張')).toBeTruthy();
 });

});

it('translates navigation and actual load outcomes while retaining selection, original alts and URLs across languages',()=>{
 localStorage.setItem('user-locale','en-US');const photos=[{id:'a',imageUrl:'https://example.invalid/a.jpg',thumbnailUrl:'https://example.invalid/at.jpg',alt:'原圖 {title} $&'},{id:'b',imageUrl:'https://example.invalid/b.jpg',thumbnailUrl:'https://example.invalid/bt.jpg',alt:'原圖二'}];
 const v=render(<ListingPhotoGallery photos={photos} title="原商品" completeness={{status:'IMPORTED_COMPLETE',sourceCount:2,physicalSourceCount:1,importedCount:2,limit:32}}/>);
 expect(screen.getAllByRole('img')[0]).toHaveAttribute('alt',photos[0].alt);expect(screen.getAllByText('Loading image…')).toHaveLength(3);
 expect(screen.getByText('All source item images have been imported (Source: 2; imported: 2)')).toBeTruthy();expect(screen.getByText('Physical-item images: 1; item-specific specifications or packaging: 1')).toBeTruthy();
 fireEvent.error(screen.getAllByRole('img')[0]);expect(screen.getByText('Images successfully viewed this visit: 0; failed to load: 1')).toBeTruthy();expect(screen.getByText('The image could not be loaded')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Next source image'}));const image=screen.getAllByRole('img')[0];expect(image).toHaveAttribute('src',photos[1].imageUrl);fireEvent.load(image);
 expect(screen.getByText('Images successfully viewed this visit: 1; failed to load: 1')).toBeTruthy();expect(screen.getByRole('button',{name:'View source image 2'})).toHaveAttribute('aria-pressed','true');
 localStorage.setItem('user-locale','zh-TW');v.rerender(<ListingPhotoGallery photos={photos} title="原商品" completeness={{status:'IMPORTED_COMPLETE',sourceCount:2,physicalSourceCount:1,importedCount:2,limit:32}}/>);
 expect(screen.getByText('第2張，共2張已收錄圖片')).toBeTruthy();expect(screen.getByText('本次已成功查看1張，1張載入失敗')).toBeTruthy();expect(screen.getAllByRole('img')[0]).toHaveAttribute('src',photos[1].imageUrl);
});

it('does not fabricate a source total or available image for a missing original',()=>{
 localStorage.setItem('user-locale','en-US');render(<ListingPhotoGallery photos={[]} title="原商品" completeness={{status:'UNVERIFIED',sourceCount:null,physicalSourceCount:null,importedCount:0,limit:32}}/>);
 expect(screen.getByText('No item image is available')).toBeTruthy();expect(screen.getByText('The source image total still needs verification')).toBeTruthy();expect(screen.queryByText(/Source: 0/)).toBeNull();expect(screen.queryByRole('button')).toBeNull();
});
