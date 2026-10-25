import {cpCoverage} from '../lib/cpCoverage';
import {statedCondition} from '../lib/discoveryCatalog';
import type {DiscoveryProduct} from '../lib/discovery';
const p={kind:'listing',key:'listing:1',title:'來自北極的禮物',mainId:'books',subId:'children',price:275,currency:'TWD',priceUnitVerified:true,condition:'USED'} as DiscoveryProduct;
test('counts the entire public catalog by source and keeps pending independent of high-CP picks',()=>{
 const scored={...p,cp:{score:65}} as DiscoveryProduct;
 const r=cpCoverage([scored,{...p,key:'listing:2',price:null},{...p,kind:'source',key:'source:1',title:'無型號商品',mainId:'other',subId:'misc'},{...p,kind:'external',key:'external:1',cpAllowed:false}]);
 expect(r.byKind.listing).toMatchObject({total:2,scored:1,highCp:0,pending:1,missingPrice:1});
 expect(r.byKind.source).toMatchObject({total:1,scored:0,pending:1,missingModel:1});
 expect(r.byKind.external).toMatchObject({total:1,pending:1,excluded:1});
});
test.each(['LEGO 21318 已組，不缺件','接近全新','近全新','有使用痕跡','二手書','僅用半年'])('recognizes explicitly stated use without claiming new: %s',title=>expect(statedCondition(title)).toBe('USED'));
test.each(['全新未使用過','全新未用過','全新未拆'])('does not interpret negated usage as used: %s',title=>expect(statedCondition(title)).toBe('NEW'));
test('does not invent condition from brand, price or manufacture year',()=>expect(statedCondition('Whirlpool WEHC10BBS 2023年製')).toBe('UNKNOWN'));
