import {cpTargets,cpFacts,validateCpOutput} from '../lib/discoveryCp';
import {discoveryHash,type DiscoveryProduct} from '../lib/discovery';
const product=(i:number,extra:Partial<DiscoveryProduct>={}):DiscoveryProduct=>({kind:'source',id:String(i),key:'source:'+i,title:'BenQ GW2270 22吋 二手螢幕 '+i,description:'Full HD VA',mainId:'electronics',subId:'monitors',classificationMethod:'TITLE_RULE',price:900+i*100,priceText:'1000',currency:'TWD',priceUnitVerified:true,thumbnailUrl:null,photos:[],county:'臺北市',district:null,condition:'USED',sourceLabel:'example.invalid',stockStatus:'UNKNOWN',canonicalUrl:null,detailPath:'/explore',date:'2026-10-24T00:00:00Z',dateBasis:'COLLECTED',dateEarliest:null,...extra});
const products=[product(1),product(2),product(3)],targets=cpTargets(products),copy={zh:'明示同型號及規格，價格較低。',en:'Same stated model and specifications at a lower price.'};
const output=()=>targets.map(t=>({key:t.product.key,verdict:'COMPARABLE',basisKeys:t.comparables.map(c=>c.key),dimensions:{price:30,specification:20,condition:15,evidence:10},reasons:[copy],limitations:[{zh:'運費、庫存及實際狀況仍需確認。',en:'Shipping, stock and actual condition require confirmation.'}]}));
test('requires known TWD price, unit, condition, permission and at least two peers',()=>{
 expect(targets).toHaveLength(3);
 for(const patch of [{price:null},{currency:null},{priceUnitVerified:false},{condition:'UNKNOWN'},{cpAllowed:false},{subId:'unclassified'}])expect(cpTargets([product(1,patch),products[1],products[2]])).toHaveLength(0);
 expect(cpTargets(products,new Set(['source:1','source:2','source:3']))).toEqual([]);
});
test('binds scores and source evidence hashes to the exact product snapshot',()=>{
 const result=validateCpOutput(output(),targets,'synthetic-model',new Date('2026-10-24T01:00:00Z'));
 expect(result['source:1']).toMatchObject({score:75,confidence:'MEDIUM',productHash:discoveryHash(cpFacts(products[0])),evaluatedAt:'2026-10-24T01:00:00.000Z'});
 expect(result['source:1'].basis).toHaveLength(2);
});
test('rejects hallucinated evidence, duplicated peers, impossible scores and missing outputs',()=>{
 const bad=output();bad[0].basisKeys=['source:999','source:2'];expect(()=>validateCpOutput(bad,targets,'m')).toThrow('CP_INVALID_EVALUATION');
 const duplicated=output();duplicated[0].basisKeys=['source:2','source:2'];expect(()=>validateCpOutput(duplicated,targets,'m')).toThrow();
 const score=output();score[0].dimensions.price=100;expect(()=>validateCpOutput(score,targets,'m')).toThrow();
 expect(()=>validateCpOutput(output().slice(1),targets,'m')).toThrow();
});
test('keeps insufficient evidence unscored, never turning it into a high-CP recommendation',()=>{
 const raw=output().map(x=>({...x,verdict:'INSUFFICIENT',dimensions:null,basisKeys:[]}));
 expect(Object.values(validateCpOutput(raw,targets,'m')).every(e=>e.score===null&&e.confidence==='LOW'&&e.dimensions===null)).toBe(true);
});

test('never scores different gemstone bracelets from shared size or category alone',()=>{
 const jewelry=[product(1,{title:'白水晶手鍊 16公分',mainId:'fashion',subId:'accessories'}),product(2,{title:'紫水晶手鍊 16公分',mainId:'fashion',subId:'accessories'}),product(3,{title:'金髮晶手鍊 16公分',mainId:'fashion',subId:'accessories'})],t=cpTargets(jewelry);
 const raw=t.map(x=>({key:x.product.key,verdict:'COMPARABLE',basisKeys:x.comparables.map(c=>c.key),dimensions:{price:40,specification:25,condition:20,evidence:15},reasons:[copy],limitations:[copy]}));
 expect(Object.values(validateCpOutput(raw,t,'m')).every(e=>e.score===null&&e.basis.length===0)).toBe(true);
});
