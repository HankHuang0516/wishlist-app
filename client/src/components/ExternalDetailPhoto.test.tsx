import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeExternalListing } from '../__tests__/fixtures/marketplace';
import { parseExternalListing } from '../lib/externalListingSearch';
import ExternalDetailPhoto from './ExternalDetailPhoto';

let savedLocale: string | null;
beforeEach(() => { savedLocale = localStorage.getItem('user-locale'); localStorage.setItem('user-locale', 'en-US'); });
afterEach(() => { vi.unstubAllGlobals();
  if (savedLocale === null) localStorage.removeItem('user-locale'); else localStorage.setItem('user-locale', savedLocale);
});
const item = () => parseExternalListing({ ...makeExternalListing(), title: '原來源 {title} $&' });
const images = (container: HTMLElement) => Array.from(container.querySelectorAll('img'));

describe('fresh external detail photo loading and fallback', () => {
  it('loads only the verified original and thumbnail without a referrer or private API request', () => {
    const value=item(), fetch=vi.fn(); vi.stubGlobal('fetch',fetch);
    const {container}=render(<ExternalDetailPhoto item={value} />); const [thumbnail,original]=images(container);
    expect(thumbnail).toHaveAttribute('src',value.thumbnailUrl); expect(original).toHaveAttribute('src',value.imageUrl);
    for(const image of [thumbnail,original]) { expect(image).toHaveAttribute('referrerPolicy','no-referrer'); expect(image).toHaveAttribute('aria-hidden','true'); expect(image).toHaveAttribute('alt',''); }
    expect(screen.getByRole('img')).toHaveAccessibleName(value.title+' · Source item photo is loading');
    expect(screen.getByRole('status')).toHaveTextContent('Loading photo…'); expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps a successfully loaded thumbnail and explains an original-photo failure', () => {
    const {container}=render(<ExternalDetailPhoto item={item()} />); const [thumbnail,original]=images(container);
    fireEvent.load(thumbnail); expect(thumbnail).toHaveClass('opacity-100'); expect(original).toHaveClass('opacity-0');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.error(original); expect(thumbnail).toHaveClass('opacity-100');
    expect(screen.getByRole('img')).toHaveAccessibleName(/showing a thumbnail/);
    expect(screen.getByRole('status')).toHaveTextContent('The high-resolution photo could not load. Showing a thumbnail.');
  });
  it('replaces a preview only after the original loads, retaining it if the thumbnail later fails', () => {
    const {container}=render(<ExternalDetailPhoto item={item()} />); const [thumbnail,original]=images(container);
    fireEvent.load(thumbnail); fireEvent.load(original); expect(original).toHaveClass('opacity-100'); expect(thumbnail).toHaveClass('opacity-0');
    fireEvent.error(thumbnail); expect(original).toHaveClass('opacity-100');
    expect(screen.getByRole('img')).toHaveAccessibleName(item().title+' · Source item photo');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('keeps loading when one image fails and shows a failed placeholder only when both fail', () => {
    const {container}=render(<ExternalDetailPhoto item={item()} />); const [thumbnail,original]=images(container);
    fireEvent.error(thumbnail); expect(screen.getByRole('status')).toHaveTextContent('Loading photo…');
    fireEvent.error(original); expect(screen.getByRole('status')).toHaveTextContent('Photos could not load. You can still verify the item on the source website.');
    expect(screen.getByRole('img')).toHaveAccessibleName(/could not load/);
    expect(thumbnail).toHaveClass('opacity-0'); expect(original).toHaveClass('opacity-0');
  });
  it('can show a later thumbnail after the original fails while the preview is still loading', () => {
    const {container}=render(<ExternalDetailPhoto item={item()} />); const [thumbnail,original]=images(container);
    fireEvent.error(original); expect(screen.getByRole('status')).toHaveTextContent('Loading photo…');
    fireEvent.load(thumbnail); expect(thumbnail).toHaveClass('opacity-100');
    expect(screen.getByRole('status')).toHaveTextContent('Showing a thumbnail.');
  });
  it('resets loaded state for a different verified photo pair, ignoring the old detached image', () => {
    const first=item(), second={...first,imageUrl:first.imageUrl.replace('.jpg','-new.jpg')};
    const {container,rerender}=render(<ExternalDetailPhoto item={first} />); const oldOriginal=images(container)[1];
    fireEvent.load(oldOriginal); expect(oldOriginal).toHaveClass('opacity-100');
    rerender(<ExternalDetailPhoto item={second} />); const newOriginal=images(container)[1];
    expect(newOriginal).toHaveAttribute('src',second.imageUrl); expect(newOriginal).toHaveClass('opacity-0');
    fireEvent.load(oldOriginal); expect(newOriginal).toHaveClass('opacity-0'); expect(screen.getByRole('status')).toHaveTextContent('Loading photo…');
    fireEvent.load(newOriginal); expect(newOriginal).toHaveClass('opacity-100');
  });
  it('translates the same fallback without changing source URLs or starting a new private request', () => {
    const value=item(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const {container,rerender}=render(<ExternalDetailPhoto item={value} />);const [thumbnail,original]=images(container);
    fireEvent.load(thumbnail);fireEvent.error(original);localStorage.setItem('user-locale','zh-TW');
    rerender(<ExternalDetailPhoto item={value} />);expect(screen.getByRole('status')).toHaveTextContent('高畫質照片暫時無法載入，目前顯示縮圖');
    expect(screen.getByRole('img')).toHaveAccessibleName(value.title+' · 來源商品圖片，顯示縮圖');
    expect(images(container)).toEqual([thumbnail,original]);expect(thumbnail).toHaveAttribute('src',value.thumbnailUrl);expect(original).toHaveAttribute('src',value.imageUrl);
    expect(thumbnail).toHaveClass('opacity-100');expect(fetch).not.toHaveBeenCalled();
  });
});
