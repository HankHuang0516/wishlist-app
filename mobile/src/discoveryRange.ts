type Page = { items: {key:string}[]; nextCursor:string|null; snapshot:string; total:number };

/** Re-read the previously loaded range after an explicit display switch.
 * Never reuse cached geometry or restart a changed snapshot automatically. */
export async function readDiscoveryRange<P extends Page>(read:(cursor:string)=>Promise<P>, count:number, cancelled:()=>boolean):Promise<P>{
 let page=await read('');
 const seen=new Set<string>();
 while(!cancelled()&&page.nextCursor&&page.items.length<Math.min(count,page.total)){
  const cursor=page.nextCursor;
  if(seen.has(cursor))throw Error('Repeated discovery cursor');
  seen.add(cursor);
  const next=await read(cursor);
  if(cancelled())return page;
  if(next.snapshot!==page.snapshot||next.total!==page.total||next.items.length===0||next.items.some(p=>page.items.some(old=>old.key===p.key)))throw Error('Discovery range changed');
  page={...next,items:[...page.items,...next.items]};
 }
 return page;
}
