import { useEffect, useRef, useState } from 'react';
import { apiObserved, ApiFailure } from './marketplaceApi';
import { parseLeadPage, parseLead, isLocatedLead, type SourceLead } from './sourceLeadData';
import type {ExploreEvidence} from './exploreEvidence';
import type { ExploreQuery } from './exploreWeb';
const sourceSearchError = '來源線索未完成讀取，已暫停自動更新；不代表沒有資料，請明確重新搜尋。' as const;
const BATCH_SIZE = 100;

export function useSourceLeadSearch(token: string, query: ExploreQuery | null, evidence:ExploreEvidence|null=null) {
  const [items, setItems] = useState<SourceLead[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState<'' | typeof sourceSearchError>('');
  const [completedSerial, setCompletedSerial] = useState(0), [retryUntil, setRetryUntil] = useState(0), [hasMore,setHasMore]=useState(false);
  const more = useRef<(() => Promise<void>) | null>(null);
  const hidden = !!query && (!!query.wishId || !!query.filters.brand || !!query.filters.category || !!query.filters.delivery || !!query.filters.condition || !!query.filters.minPrice || !!query.filters.maxPrice || query.filters.q.length > 80);
  useEffect(() => {
    evidence?.activate();
    let active = true, loading = false, paused = false;
    let saved:SourceLead[] = [], nextCursor:string|null=null, cursors=new Set<string>();
    const controller = new AbortController();
    setItems([]); setError(''); setCompletedSerial(0); setRetryUntil(0); setHasMore(false);setBusy(!!query && !hidden);
    if (!query || hidden) { more.current=null;if (query) {evidence?.finish('source',[],null,false,'skipped');setCompletedSerial(query.serial);} return () => controller.abort(); }
    async function load(append=false) {
      if (loading || paused || append&&!nextCursor) return;
      loading=true;setBusy(true);
      if(append)evidence?.resume('source');else evidence?.begin('source',true);
      try {
        const rows=append?[...saved]:[], seen=append?new Set(cursors):new Set<string>();
        const target=append?rows.length+BATCH_SIZE:Math.max(BATCH_SIZE,saved.length);
        let cursor=append?nextCursor:null,lastEnabled=true;
        do {
          const path='/source-leads?presentation=1&photos=2&approximate=1&unlocated=1&bbox='+query!.bounds.join(',')+'&q='+encodeURIComponent(query!.filters.q)+(cursor?'&cursor='+cursor:'');
          const startedAt=new Date().toISOString();let status:number|null=null;let raw:unknown;
          try{raw=await apiObserved<unknown>(token,path,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30_000)])},s=>{status=s;});if(active)evidence?.page('source',startedAt,status,raw);}
          catch(e){if(active)evidence?.transportError('source',startedAt,status);throw e;}
          const page=parseLeadPage(raw);lastEnabled=page.enabled;rows.push(...page.items);cursor=page.nextCursor;
          if(cursor&&seen.has(cursor))throw Error('SOURCE_CURSOR_LOOP');
          if(cursor)seen.add(cursor);
          // A full batch is a usable page, never a failed/empty search.
          if(rows.length>=target)break;
        } while(cursor);
        if(active){saved=[...new Map(rows.map(row=>[row.id,row])).values()];nextCursor=cursor;cursors=seen;evidence?.finish('source',saved.map(r=>r.id),cursor,lastEnabled);setItems(saved);setHasMore(cursor!==null);}
      }catch(failure){
        paused=true;if(active){evidence?.fail('source',failure instanceof ApiFailure?failure.status:null);setError(sourceSearchError);if(failure instanceof ApiFailure&&failure.status===429&&failure.retryAfterMs>0)setRetryUntil(Date.now()+failure.retryAfterMs);}
      }finally{loading=false;if(active){setBusy(false);setCompletedSerial(query!.serial);}}
    }
    const loadMore=()=>load(true);more.current=loadMore;
    void load();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},30_000);
    return()=>{active=false;controller.abort();window.clearInterval(timer);if(more.current===loadMore)more.current=null;};
  }, [token, query, hidden, evidence]);
  const current=(completedSerial===query?.serial?items:[]).filter(row=>{try{parseLead(row);return true;}catch{return false;}});
  return {completedSerial,retryUntil,items:current.filter(isLocatedLead),contactItems:current.filter(row=>!isLocatedLead(row)),busy:busy||!!query&&completedSerial!==query.serial,error,hidden,hasMore:completedSerial===query?.serial&&hasMore,loadMore:()=>more.current?.()};
}
