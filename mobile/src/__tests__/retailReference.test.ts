import {expect,it} from 'vitest';
import {parseRetailReference,retailLabel,retailRatio} from '../retailReference';
const key='listing:12345678-1234-4234-8234-123456789abc';
const value={productKey:key,currency:'TWD',price:4990,priceType:'MANUFACTURER_MSRP',sourceUrl:'https://www.samsung.com/tw/',sourceTitle:'同型號原廠依據',sourceProductTitle:'Galaxy Buds3',sourcePeriod:'2025-04',checkedAt:'2026-10-25T00:00:00Z'};
it('keeps the original amount/source and derives a fold from asking price, not CP scores',()=>{
  const reference=parseRetailReference(value,key)!;
  expect(reference.price).toBe(4990);expect(reference.sourceUrl).toBe(value.sourceUrl);
  expect(retailRatio(2500,'TWD',true,reference)).toBeCloseTo(5.01002);
  expect(retailLabel(retailRatio(2500,'TWD',true,reference)!)).toBe('約參考原價 5 折');
});
it.each([{productKey:'source:other'},{currency:'USD'},{price:0},{price:NaN},{sourceUrl:'http://www.samsung.com/'},{sourceUrl:'https://user:secret@example.com/'},{sourceUrl:'https://127.0.0.1/'},{sourceUrl:'https://a.internal/'},{sourcePeriod:'2025-13'},{checkedAt:'invalid'}])('rejects optional invalid evidence without fabricating a price %j',patch=>{
  expect(parseRetailReference({...value,...patch},key)).toBeUndefined();
});
it('does not compare unknown units, foreign currency, unknown amounts or invalid originals',()=>{
  const r=parseRetailReference(value,key)!;
  for(const [price,currency,unit] of [[null,'TWD',true],[2500,null,true],[2500,'USD',true],[2500,'TWD',false],[NaN,'TWD',true],[-1,'TWD',true]] as const)
    expect(retailRatio(price,currency,unit,r)).toBeUndefined();
  expect(retailRatio(2500,'TWD',true,{...r,price:0})).toBeUndefined();
});
it('distinguishes free, tiny positive, equal and above-original prices without false discount claims',()=>{
  const r=parseRetailReference(value,key)!;
  expect(retailLabel(retailRatio(0,'TWD',true,r)!)).toContain('免費贈送');
  expect(retailLabel(retailRatio(1,'TWD',true,r)!)).toBe('低於參考原價的 0.1 折');
  expect(retailLabel(10)).toBe('與參考原價相同');expect(retailLabel(11)).toBe('高於參考原價');expect(retailLabel(9.99)).toBe('接近參考原價');
});
