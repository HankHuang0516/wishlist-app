import { afterEach, describe, expect, it } from 'vitest';
import { sourceLeadPrice } from './sourceLeadPrice';

afterEach(() => localStorage.setItem('user-locale', 'zh-TW'));
describe('original source price presentation', () => {
  it.each([undefined, null, '', 'None', '原帖標價：None元；幣別依情境推定，非即時報價，不等同含運總價。', '原帖標價：null元；待確認'])('does not present unavailable price %s as money or free', value => {
    localStorage.setItem('user-locale', 'zh-TW');
    expect(sourceLeadPrice(value)).toBe('售價待詢問');
    localStorage.setItem('user-locale', 'en-US');
    expect(sourceLeadPrice(value)).toBe('Ask about price');
  });
  it.each(['原帖標價：0元；非即時報價。', '原帖標價：150元；非即時報價。', '原帖標價：50–100元；依尺寸。', '價格另議', 'None 品牌售價 NT$ 100'])('retains the original valid price verbatim: %s', value => {
    expect(sourceLeadPrice(value)).toBe(value);
    localStorage.setItem('user-locale', 'en-US');
    expect(sourceLeadPrice(value)).toBe(value);
  });
});
