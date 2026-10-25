export type MapCatalog={id:string;label:string;children:{id:string;label:string}[]};
type Item={key:string;mainId:string;subId:string};
export type ThumbnailNode={key:string;x:number;y:number;size:number;mainId:string;subId:string};
export type MapHeading={key:string;label:string;x:number;y:number;width:number;height:number;level:1|2;count:number};
export type MapGroupBox={key:string;x:number;y:number;width:number;height:number};
export type PublicMapLocation={coordinates:[number,number];precision:'APPROXIMATE_2KM'|'COUNTY_ILLUSTRATION'|'PUBLIC_MEETING_POINT'|'DISTRICT_CENTER';visibleUntil?:string};
export function parsePublicMapLocation(value:unknown):PublicMapLocation|null {
 if(value===null)return null;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Map location missing');
 const v=value as Record<string,unknown>,coordinates=v.coordinates;
 if(Object.keys(v).some(k=>!['coordinates','precision','visibleUntil'].includes(k))||!Array.isArray(coordinates)||coordinates.length!==2||coordinates.some(n=>typeof n!=='number'||!Number.isFinite(n))||
    coordinates[0]<117||coordinates[0]>123.8||coordinates[1]<20||coordinates[1]>26.6||
    !['APPROXIMATE_2KM','COUNTY_ILLUSTRATION','PUBLIC_MEETING_POINT','DISTRICT_CENTER'].includes(String(v.precision))||
    (v.precision==='APPROXIMATE_2KM'?(typeof v.visibleUntil!=='string'||!Number.isFinite(Date.parse(v.visibleUntil))):v.visibleUntil!==undefined))throw Error('Invalid public map location');
 return {coordinates:[coordinates[0],coordinates[1]],precision:v.precision as PublicMapLocation['precision'],...(typeof v.visibleUntil==='string'?{visibleUntil:v.visibleUntil}:{})};
}

/** Display-only layout. It deliberately has no geographic fields to rewrite.
 * Large/narrow layouts grow the explicit canvas rather than shrinking targets. */
export function discoveryMapLayout(items:readonly Item[],catalog:readonly MapCatalog[],requestedWidth:number,fontScale=1){
 if(!Number.isFinite(requestedWidth)||requestedWidth<=0||!Number.isFinite(fontScale)||fontScale<=0||new Set(items.map(p=>p.key)).size!==items.length)throw Error('Invalid map layout input');
 const width=Math.max(280,Math.floor(requestedWidth)),scale=Math.max(1,fontScale),size=52,gap=8,pad=12;
 const regions=width>=304&&scale<1.3?2:width>=720?2:1;
 const groupWidth=(width-pad*2-gap*(regions-1))/regions;
 const columns=Math.max(1,Math.floor((groupWidth-pad*2+gap)/(size+gap)));
 const nodes:ThumbnailNode[]=[],headings:MapHeading[]=[],boxes:MapGroupBox[]=[];
 const order=(ids:readonly string[],key:string)=>{const i=ids.indexOf(key);return i<0?ids.length:i;};
 const mainIds=[...new Set(items.map(p=>p.mainId))].sort((a,b)=>order(catalog.map(c=>c.id),a)-order(catalog.map(c=>c.id),b)||a.localeCompare(b));
 const textHeight=(label:string,level:1|2)=>{
  const units=[...label].reduce((n,c)=>n+(/[\p{Script=Han}]/u.test(c)?1:.75),0);
  return Math.max((level===1?32:24)*scale,Math.ceil(units*(level===1?15:13)*scale/(groupWidth-pad*2))*(level===1?21:19)*scale);
 };
 let rowY=pad,rowHeight=0;
 mainIds.forEach((mainId,index)=>{
  if(index&&index%regions===0){rowY+=rowHeight+gap;rowHeight=0;}
  const x=pad+(index%regions)*(groupWidth+gap),startY=rowY,group=catalog.find(c=>c.id===mainId),members=items.filter(p=>p.mainId===mainId);
  const label=group?.label??'未分類',height=textHeight(label+' · '+members.length,1);
  let y=startY+pad;
  headings.push({key:'main:'+mainId,label,x:x+pad,y,width:groupWidth-pad*2,height,level:1,count:members.length});y+=height+gap;
  const subIds=[...new Set(members.map(p=>p.subId))].sort((a,b)=>order(group?.children.map(s=>s.id)??[],a)-order(group?.children.map(s=>s.id)??[],b)||a.localeCompare(b));
  for(const subId of subIds){
   const children=members.filter(p=>p.subId===subId).slice().sort((a,b)=>a.key.localeCompare(b.key)),label=group?.children.find(s=>s.id===subId)?.label??'其他';
   const headingHeight=textHeight(label+' · '+children.length,2);
   headings.push({key:mainId+':'+subId,label,x:x+pad,y,width:groupWidth-pad*2,height:headingHeight,level:2,count:children.length});y+=headingHeight+gap;
   children.forEach((p,i)=>nodes.push({key:p.key,x:x+pad+(i%columns)*(size+gap),y:y+Math.floor(i/columns)*(size+gap),size,mainId,subId}));
   y+=Math.ceil(children.length/columns)*(size+gap)+gap;
  }
  const boxHeight=y-startY;boxes.push({key:mainId,x,y:startY,width:groupWidth,height:boxHeight});rowHeight=Math.max(rowHeight,boxHeight);
 });
 return {width,height:Math.max(420,rowY+rowHeight+pad),nodes,headings,boxes};
}
