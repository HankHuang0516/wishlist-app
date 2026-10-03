import {describe,it,expect} from 'vitest';
import {exploreResultStatus,type LoadedSourceState} from '../exploreResultStatus';
const source=(patch:Partial<LoadedSourceState>={}):LoadedSourceState=>({count:0,busy:false,ready:true,error:'',hasMore:false,enabled:true,skipped:false,...patch});
describe('buyer-visible loaded result states',()=>{
 it('never calls native0 plus lead1 an empty map or unique inventory total',()=>{const r=exploreResultStatus(source(),source({enabled:false}),source({count:1}));expect(r.empty).toBe(false);expect(r.summary).toContain('站內刊登已載入 0 件');expect(r.summary).toContain('待確認來源已載入 1 筆');expect(r.summary).not.toContain('共');});
 it('labels a 25-row page as loaded with more rather than total25',()=>{const r=exploreResultStatus(source(),source({enabled:false}),source({count:25,hasMore:true}));expect(r.summary).toContain('已載入 25 筆，還有更多');expect(r.more).toBe(true);expect(r.empty).toBe(false);});
 it('distinguishes empty, loading, failure, unqueried filter and disabled source',()=>{
  expect(exploreResultStatus(source(),source(),source()).empty).toBe(true);
  for(const patch of [{busy:true},{ready:false},{error:'network'},{hasMore:true}])expect(exploreResultStatus(source(),source(),source(patch)).empty).toBe(false);
  expect(exploreResultStatus(source(),source({enabled:false}),source({skipped:true})).summary).toContain('待確認來源：此條件未查');
  expect(exploreResultStatus(source(),source({enabled:false}),source({error:'network'})).summary).toContain('讀取失敗');
 });
});
