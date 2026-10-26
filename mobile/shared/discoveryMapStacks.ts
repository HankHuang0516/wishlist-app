export type StackPoint={key:string;x:number;y:number;coordinates:[number,number]};
export type MapStack={key:string;keys:string[];x:number;y:number;coordinates:[number,number]};

/** Display grouping only. Keep the seed's public coordinate, never rewrite a
 * product location. Membership is complete and deterministic for this viewport. */
export function discoveryMapStacks(points:readonly StackPoint[],radius=88):MapStack[]{
 if(!Number.isFinite(radius)||radius<64||new Set(points.map(p=>p.key)).size!==points.length||points.some(p=>![p.x,p.y,...p.coordinates].every(Number.isFinite)))throw Error('Invalid map stack input');
 const stacks:MapStack[]=[];
 for(const point of [...points].sort((a,b)=>a.key.localeCompare(b.key))){
  const nearby=stacks.find(s=>Math.hypot(s.x-point.x,s.y-point.y)<radius);
  if(nearby)nearby.keys.push(point.key);
  else stacks.push({key:point.key,keys:[point.key],x:point.x,y:point.y,coordinates:[...point.coordinates]});
 }
 return stacks;
}
