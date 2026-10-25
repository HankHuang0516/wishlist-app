import {test,expect,vi} from 'vitest';
import {readDiscoveryRange} from '../discoveryRange';
const page=(start:number,count:number,snapshot='stable')=>({items:Array.from({length:count},(_,i)=>({key:String(start+i)})),nextCursor:start+count<96?String(start+count):null,snapshot,total:96});
test('an explicit mode switch re-reads all72 previously loaded rows with fresh geometry',async()=>{
 const read=vi.fn(async(cursor:string)=>page(Number(cursor||0),24));
 const result=await readDiscoveryRange(read,72,()=>false);
 expect(result.items).toHaveLength(72);expect(result.items[71].key).toBe('71');expect(read.mock.calls.map(c=>c[0])).toEqual(['','24','48']);
});
test('does not mix snapshots or repeat a cursor on restoration',async()=>{
 await expect(readDiscoveryRange(async c=>page(Number(c||0),24,c?'changed':'stable'),72,()=>false)).rejects.toThrow('Discovery range changed');
 await expect(readDiscoveryRange(async c=>({...page(Number(c||0),24),nextCursor:'24'}),72,()=>false)).rejects.toThrow('Repeated discovery cursor');
});
test('a cancelled account/query cannot issue another range read',async()=>{
 const read=vi.fn(async()=>page(0,24));const result=await readDiscoveryRange(read,72,()=>true);
 expect(read).toHaveBeenCalledTimes(1);expect(result.items).toHaveLength(24);
});
