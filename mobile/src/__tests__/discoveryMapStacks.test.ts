import {describe,expect,it} from 'vitest';
import {discoveryMapStacks} from '../discoveryMapStacks';
describe('geographic display stacks',()=>{
 it.each([0,1,2,6,36,60])('keeps all %i dense IDs exactly once with immutable public coordinates',count=>{
  const points=Array.from({length:count},(_,i)=>({key:`p${String(i).padStart(2,'0')}`,x:120+i/10,y:180+i/10,coordinates:[120.5+i/1000,23.5] as [number,number]})),before=JSON.stringify(points),stacks=discoveryMapStacks(points);
  expect(stacks.flatMap(s=>s.keys).sort()).toEqual(points.map(p=>p.key).sort());expect(stacks).toHaveLength(count?1:0);expect(JSON.stringify(points)).toBe(before);expect(discoveryMapStacks([...points].reverse())).toEqual(stacks);
 });
 it('separates distant stacks and preserves the seed location instead of inventing a product location',()=>{
  const points=[{key:'a',x:10,y:10,coordinates:[120,23] as [number,number]},{key:'b',x:50,y:10,coordinates:[120.1,23] as [number,number]},{key:'c',x:200,y:10,coordinates:[121,23] as [number,number]}];
  const stacks=discoveryMapStacks(points);expect(stacks.map(s=>s.keys)).toEqual([['a','b'],['c']]);expect(stacks[0].coordinates).toEqual(points[0].coordinates);expect(stacks[0].coordinates).not.toBe(points[0].coordinates);
 });
 it('rejects duplicate IDs and invalid projection input instead of silently dropping members',()=>{
  const p={key:'a',x:10,y:10,coordinates:[120,23] as [number,number]};expect(()=>discoveryMapStacks([p,p])).toThrow();expect(()=>discoveryMapStacks([{...p,x:NaN}])).toThrow();expect(()=>discoveryMapStacks([p],0)).toThrow();
 });
});
