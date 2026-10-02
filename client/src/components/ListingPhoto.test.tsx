import {afterEach,describe,it,expect} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {ListingPhoto,ListingPhotoGallery} from './ListingPhoto';
afterEach(cleanup);
describe('shared listing photo presentation',()=>{
 it('does not request a substitute image without authorized media',()=>{render(<ListingPhoto alt="鍋具"/>);expect(screen.queryByRole('img')).toBeNull();expect(screen.getByRole('status').textContent).toContain('尚未取得展示許可');});
 it('shows loading and network failure, resets for the next item and keeps square cover thumbnails',()=>{const v=render(<ListingPhoto src="https://example.invalid/a.jpg" alt="a"/>);expect(screen.getByRole('status').textContent).toContain('載入中');fireEvent.error(screen.getByRole('img'));expect(screen.queryByRole('img')).toBeNull();expect(screen.getByRole('status').textContent).toContain('暫時無法載入');v.rerender(<ListingPhoto src="https://example.invalid/b.jpg" alt="b"/>);const img=screen.getByRole('img');expect(img.className).toContain('object-cover');fireEvent.load(img);expect(screen.queryByRole('status')).toBeNull();});
 it('preserves original sequence and fits the original detail image without crop',()=>{const photos=[{id:'a',imageUrl:'https://example.invalid/a.jpg',thumbnailUrl:'https://example.invalid/at.jpg',alt:'第一張'},{id:'b',imageUrl:'https://example.invalid/b.jpg',thumbnailUrl:'https://example.invalid/bt.jpg',alt:'第二張'}];render(<ListingPhotoGallery photos={photos} title="鍋具"/>);expect(screen.getAllByRole('img')[0].className).toContain('object-contain');fireEvent.click(screen.getByRole('button',{name:'查看第2張來源照片'}));expect(screen.getAllByRole('img')[0].getAttribute('src')).toBe(photos[1].imageUrl);});
});
