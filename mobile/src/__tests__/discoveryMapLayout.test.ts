import {expect,it} from 'vitest';
import {discoveryMapLayout} from '../discoveryMapLayout';
const catalog=Array.from({length:4},(_,i)=>({id:'main'+i,label:['3C 數位','家具家居','書籍文具','運動戶外'][i],children:[{id:'a',label:'同分類商品'},{id:'b',label:'其他配件'}]}));
const make=(count:number)=>Array.from({length:count},(_,i)=>({key:'product:'+String(i).padStart(3,'0'),mainId:'main'+i%4,subId:i%3?'a':'b',coordinates:[120+i/1000,23] as const}));
for(const count of [1,2,6,36,96])for(const width of [280,320,390,736])for(const font of [1,1.5])it(`${count} distinct targets stay reachable at ${width}px / ${font} font without clipping or overlaps`,()=>{
 const items=make(count),before=JSON.stringify(items),layout=discoveryMapLayout(items,catalog,width,font);
 expect(layout.nodes).toHaveLength(count);expect(new Set(layout.nodes.map(n=>n.key)).size).toBe(count);
 for(const n of layout.nodes){expect(n.size).toBeGreaterThanOrEqual(48);expect(n.x).toBeGreaterThanOrEqual(0);expect(n.y).toBeGreaterThanOrEqual(0);expect(n.x+n.size).toBeLessThanOrEqual(layout.width);expect(n.y+n.size).toBeLessThanOrEqual(layout.height);}
 for(let i=0;i<layout.nodes.length;i++)for(let j=i+1;j<layout.nodes.length;j++){
  const a=layout.nodes[i],b=layout.nodes[j];expect(a.x+a.size<=b.x||b.x+b.size<=a.x||a.y+a.size<=b.y||b.y+b.size<=a.y).toBe(true);
 }
 expect(JSON.stringify(items)).toBe(before);
 expect(discoveryMapLayout([...items].reverse(),catalog,width,font)).toEqual(layout);
});
it('does not replace unknown categories with representative thumbnails and rejects duplicate product identities',()=>{
 const items=make(36).map(p=>({...p,mainId:'unknown',subId:'unknown'}));const layout=discoveryMapLayout(items,[],320);
 expect(layout.nodes).toHaveLength(36);expect(layout.headings[0].label).toBe('未分類');
 expect(()=>discoveryMapLayout([items[0],items[0]],catalog,320)).toThrow();
});
