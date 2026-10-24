import {describe,it,expect} from 'vitest';
import {matchesCategorySearch} from './discoveryCategorySearch';
const parent={id:'electronics',label:'3C數位',en:'Electronics'};
describe('category navigation vocabulary',()=>{
 it('finds the laptop category through common Chinese and English names',()=>{
  const child={id:'laptops',label:'筆記型電腦',en:'Laptops'};
  for(const q of ['筆電','notebook','ＭａｃＢｏｏｋ','3c 筆電','laptop'])expect(matchesCategorySearch(q,parent,child)).toBe(true);
  expect(matchesCategorySearch('螢幕',parent,child)).toBe(false);
 });
 it('finds translated labels regardless of current UI locale without assigning product brands',()=>{
  expect(matchesCategorySearch('monitor',parent,{id:'monitors',label:'電腦螢幕',en:'Monitors'})).toBe(true);
  expect(matchesCategorySearch('顯示器',parent,{id:'monitors',label:'電腦螢幕',en:'Monitors'})).toBe(true);
  expect(matchesCategorySearch('iPad',parent,{id:'tablets',label:'平板',en:'Tablets'})).toBe(true);
  expect(matchesCategorySearch('iPad',parent,{id:'phones',label:'手機',en:'Phones'})).toBe(false);
 });
});
