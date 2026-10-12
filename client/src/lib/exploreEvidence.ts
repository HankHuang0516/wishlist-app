import type {ExploreQuery} from './exploreWeb';
export type SourceKind='seller'|'external'|'source';
type Page={startedAt:string;endedAt:string;httpStatus:number|null;outcome:'accepted'|'error';ids:string[];nextCursor:string|null|undefined;enabled:boolean|null};
type Layer={phase:'pending'|'partial'|'complete'|'disabled'|'fallback404'|'skipped'|'error'|'cancelled';pages:Page[];ids:string[];enabled:boolean|null;terminal:boolean;cap:boolean;errorStatus:number|null};
const fresh=():Layer=>({phase:'pending',pages:[],ids:[],enabled:null,terminal:false,cap:false,errorStatus:null});
export class ExploreEvidence {
 readonly query:{serial:number;bbox:number[];filters:ExploreQuery['filters'];wishSearch:boolean;radius:string};
 readonly startedAt=new Date().toISOString();readonly layers:Record<SourceKind,Layer>={seller:fresh(),external:fresh(),source:fresh()};
 cancelled=false;sourceReadCycles=0;
 constructor(q:ExploreQuery){this.query={serial:q.serial,bbox:[...q.bounds],filters:{...q.filters},wishSearch:q.wishId!==null,radius:q.radius};}
 activate(){if(this.cancelled){this.cancelled=false;this.sourceReadCycles=0;for(const k of ['seller','external','source'] as const)this.layers[k]=fresh();}}
 begin(k:SourceKind,reset=false){if(this.cancelled)return;if(k==='source')this.sourceReadCycles++;if(reset)this.layers[k]=fresh();else this.layers[k].phase='pending';}
 page(k:SourceKind,startedAt:string,status:number|null,raw:unknown){
  if(this.cancelled)return;
  const r=raw as {items?:{id?:string;listing?:{id?:string}}[];nextCursor?:string|null;enabled?:boolean};
  const ids=Array.isArray(r?.items)?r.items.map(i=>i.listing?.id??i.id).filter((id):id is string=>typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id)):[];
  this.layers[k].pages.push({startedAt,endedAt:new Date().toISOString(),httpStatus:status,outcome:'accepted',ids,nextCursor:typeof r?.nextCursor==='string'||r?.nextCursor===null?r.nextCursor:undefined,enabled:typeof r?.enabled==='boolean'?r.enabled:null});
 }
 finish(k:SourceKind,ids:string[],cursor:string|null,enabled=true,reason?:'fallback404'|'skipped'){
  if(this.cancelled)return;const l=this.layers[k];l.ids=[...new Set(ids)];l.enabled=enabled;l.terminal=cursor===null;l.cap=ids.length>=500&&cursor!==null;
  l.phase=reason??(!enabled?'disabled':l.cap?'partial':l.terminal?'complete':'partial');
 }
 limit(k:SourceKind){if(!this.cancelled)this.layers[k].cap=true;}
 transportError(k:SourceKind,startedAt:string,status:number|null){if(this.cancelled)return;this.layers[k].pages.push({startedAt,endedAt:new Date().toISOString(),httpStatus:status,outcome:'error',ids:[],nextCursor:undefined,enabled:null});}
 fail(k:SourceKind,status:number|null){if(this.cancelled)return;const l=this.layers[k];l.phase='error';l.terminal=false;l.errorStatus=status;if(l.pages.length)l.pages[l.pages.length-1].outcome='error';}
 cancel(){this.cancelled=true;for(const l of Object.values(this.layers))if(l.phase==='pending'||l.phase==='partial')l.phase='cancelled';}
 snapshot(visible:Record<SourceKind,string[]>){
  const layers=Object.fromEntries(Object.entries(this.layers).map(([k,l])=>[k,{...l,visibleIds:[...new Set(visible[k as SourceKind])],filteredCount:l.ids.filter(id=>!visible[k as SourceKind].includes(id)).length}]));
  const comparable=this.sourceReadCycles<=1&&!this.cancelled&&Object.values(this.layers).every(l=>l.phase==='complete'&&l.terminal&&!l.cap);
  return {schemaVersion:1,query:this.query,startedAt:this.startedAt,capturedAt:new Date().toISOString(),cancelled:this.cancelled,atomicSnapshot:false,sourceReadCycles:this.sourceReadCycles,comparable,qualifiedSupplyCount:null,qualifiedSupplyReason:'Item rights and current stock not verified by search.',layers};
 }
}
