import {render,screen,fireEvent} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import RetailPriceNote from './RetailPriceNote';
import MarketplaceDialog from './MarketplaceDialog';
import {retailComparison,retailComparisonLabel} from '../lib/retailComparison';
const retail={price:4990,priceType:'MANUFACTURER_MSRP' as const,sourceUrl:'https://www.samsung.com/tw/audio-sound/',sourceTitle:'Same-model original price',sourcePeriod:'2025-04',checkedAt:'2026-10-25T00:00:00Z'};
afterEach(()=>localStorage.clear());
it('shows a comprehensible fold and discloses the attributable original only on activation',()=>{
  localStorage.setItem('user-locale','zh-TW');
  render(<RetailPriceNote retail={retail} currentPrice={2500} currency="TWD" unitVerified/>);
  const badge=screen.getByText('約參考原價 5 折');
  expect(screen.queryByText('NT$ 4,990')).not.toBeInTheDocument();
  fireEvent.click(badge);
  expect(screen.getByRole('dialog',{name:'參考原價與來源'})).toBeVisible();
  expect(screen.getByText('NT$ 4,990')).toBeVisible();
  expect(screen.getByText(retail.sourceTitle)).toBeVisible();
  expect(screen.getByRole('link',{name:'原廠建議售價依據'})).toHaveAttribute('href',retail.sourceUrl);
  expect(screen.getByRole('link')).toHaveAttribute('rel','noopener noreferrer');
  expect(screen.getByText(/不代表目前最低新品價/)).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'關閉原價參考'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it.each([null,undefined,NaN,-1])('never invents a fold for missing or invalid asking price %s',price=>{
  // Missing price must not silently switch a product card to a rounded evaluation conversion.
  expect(retailComparison(retail,undefined,price,'TWD',true)).toBeUndefined();
});
it.each([['USD',true],[null,true],['TWD',false]])('requires an explicit comparable currency and unit %s %s',(currency,unit)=>{
  expect(retailComparison(retail,undefined,2500,currency as string|null,unit as boolean)).toBeUndefined();
});
it('uses actual asking price, never CP points or an obsolete rounded conversion',()=>{
  const conversion={originalPrice:4990,priceRatio:8,savingsPercent:20,pricePoints:7};
  expect(retailComparison(retail,conversion,2500,'TWD',true)?.ratio).toBeCloseTo(5.01002);
  expect(retailComparisonLabel(retailComparison(retail,undefined,1,'TWD',true)!.ratio,false,'zh-TW')).toBe('低於參考原價的 0.1 折');
  expect(retailComparisonLabel(0,false,'zh-TW')).not.toContain('免費');
  expect(retailComparisonLabel(0,true,'zh-TW')).toContain('免費');
  expect(retailComparisonLabel(12,false,'zh-TW')).toBe('高於參考原價');
  expect(retailComparisonLabel(10,false,'zh-TW')).toBe('與參考原價相同');
  expect(retailComparisonLabel(9.99,false,'zh-TW')).toBe('接近參考原價');
  expect(retailComparisonLabel(5,false,'en-US')).toBe('About 50% of reference price');
});
it.each([{price:0},{checkedAt:'invalid'},{sourceUrl:'javascript:alert(1)'},{sourceUrl:'https://user:secret@example.com/'},{sourceUrl:'https://127.0.0.1/'},{sourceUrl:'https://price.internal/'}])('hides invalid original evidence %j',patch=>{
  expect(retailComparison({...retail,...patch},undefined,2500,'TWD',true)).toBeUndefined();
});
it('closes only the price evidence on Escape and restores focus inside the parent detail',()=>{
 localStorage.setItem('user-locale','zh-TW');const closeParent=vi.fn();
 render(<MarketplaceDialog title="商品詳情" onClose={closeParent}><RetailPriceNote retail={retail} currentPrice={2500} currency="TWD" unitVerified/></MarketplaceDialog>);
 const trigger=screen.getByRole('button',{name:'約參考原價 5 折'});trigger.focus();fireEvent.click(trigger);
 const evidence=screen.getByRole('dialog',{name:'參考原價與來源'});fireEvent.keyDown(evidence,{key:'Escape'});
 expect(closeParent).not.toHaveBeenCalled();expect(screen.queryByRole('dialog',{name:'參考原價與來源'})).not.toBeInTheDocument();
 expect(screen.getByRole('dialog',{name:'商品詳情'})).toBeVisible();expect(trigger).toHaveFocus();
});
