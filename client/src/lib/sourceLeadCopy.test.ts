import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {sourceLeadText,sourceLeadRoutingReason} from './sourceLeadCopy';
let originalLocale:string|null;
beforeEach(()=>{originalLocale=localStorage.getItem('user-locale');localStorage.setItem('user-locale','en-US')});
afterEach(()=>{vi.restoreAllMocks();if(originalLocale===null)localStorage.removeItem('user-locale');else localStorage.setItem('user-locale',originalLocale)});
describe('closed source-lead UI copy preserves source evidence',()=>{
 it('interpolates original titles literally and defaults to English when locale storage is unavailable',()=>{
  expect(sourceLeadText('查看 {title}',{title:'原商品 {title} $&'})).toBe('View 原商品 {title} $&');
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('storage unavailable')});expect(sourceLeadText('來源線索地圖')).toBe('Source lead map');
 });
 it('translates generated route notices without upgrading verification or delivery, and preserves independently recorded reasons',()=>{
  expect(sourceLeadRoutingReason()).toContain('needs verification');
  expect(sourceLeadRoutingReason({status:'UNVERIFIED',reason:'原貼文與作者身份不等於可收訊路由；尚未核實原賣家可用的聯絡入口，未外送。',checkedAt:null})).toContain('nothing has been forwarded');
  const reason='原人工核對文字 {reason} $&';expect(sourceLeadRoutingReason({status:'UNAVAILABLE',reason,checkedAt:new Date().toISOString()})).toBe(reason);
  expect(sourceLeadRoutingReason({status:'VERIFIED',reason:'原賣家收訊路由已有獨立核實，仍需逐次核對有效性及外送回執。',checkedAt:new Date().toISOString()})).toContain('still need checking for each inquiry');
 });
});
