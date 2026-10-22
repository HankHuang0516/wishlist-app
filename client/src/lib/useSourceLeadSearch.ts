import { useEffect, useState } from 'react';
import { apiObserved, ApiFailure } from './marketplaceApi';
import { parseLeadPage, parseLead, isLocatedLead, type SourceLead } from './sourceLeadData';
import type {ExploreEvidence} from './exploreEvidence';
import type { ExploreQuery } from './exploreWeb';
const sourceSearchError = '來源線索未完成讀取，已暫停自動更新；不代表沒有資料，請明確重新搜尋。' as const;

export function useSourceLeadSearch(token: string, query: ExploreQuery | null, evidence:ExploreEvidence|null=null) {
  const [items, setItems] = useState<SourceLead[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState<'' | typeof sourceSearchError>('');
  const [completedSerial, setCompletedSerial] = useState(0), [retryUntil, setRetryUntil] = useState(0);
  const hidden = !!query && (!!query.wishId || !!query.filters.brand || !!query.filters.category || !!query.filters.delivery || !!query.filters.condition || !!query.filters.minPrice || !!query.filters.maxPrice || query.filters.q.length > 80);
  useEffect(() => {
    evidence?.activate();
    let active = true, loading = false, paused = false;
    const controller = new AbortController();
    setItems([]); setError(''); setCompletedSerial(0); setRetryUntil(0); setBusy(!!query && !hidden);
    if (!query || hidden) { if (query) {evidence?.finish('source',[],null,false,'skipped');setCompletedSerial(query.serial);} return () => controller.abort(); }
    async function load() {
      if (loading || paused) return;
      loading = true;evidence?.begin('source',true);
      try {
        const rows: SourceLead[] = [], seen = new Set<string>();
        let cursor: string | null = null;let lastEnabled=true;
        do {
          const path = '/source-leads?presentation=1&photos=2&approximate=1&unlocated=1&bbox=' + query!.bounds.join(',') + '&q=' + encodeURIComponent(query!.filters.q) + (cursor ? '&cursor=' + cursor : '');
          const startedAt=new Date().toISOString();let status:number|null=null;let raw:unknown;
          try{raw=await apiObserved<unknown>(token,path,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30_000)])},s=>{status=s;});if(active)evidence?.page('source',startedAt,status,raw);}
          catch(e){if(active)evidence?.transportError('source',startedAt,status);throw e;}
          const page = parseLeadPage(raw);lastEnabled=(raw as {enabled?:boolean})?.enabled!==false;
          rows.push(...page.items); cursor = page.nextCursor;
          if (cursor && seen.has(cursor)) throw Error();
          if (cursor) seen.add(cursor);
          if (rows.length >= 500 && cursor) {evidence?.limit('source');throw Error();}
        } while (cursor);
        if (active) {evidence?.finish('source',rows.map(r=>r.id),null,lastEnabled);setItems([...new Map(rows.map(row => [row.id, row])).values()]);}
      } catch (failure) {
        // Expiry of an API cooldown or a timer never authorizes another search.
        // A new user-submitted query creates a new effect and resumes reads.
        paused = true;if(active)evidence?.fail('source',failure instanceof ApiFailure?failure.status:null);
        if (active) {
          setError(sourceSearchError);
          if (failure instanceof ApiFailure && failure.status === 429 && failure.retryAfterMs > 0) setRetryUntil(Date.now() + failure.retryAfterMs);
        }
      } finally {
        loading = false;
        if (active) { setBusy(false); setCompletedSerial(query!.serial); }
      }
    }
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30_000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [token, query, hidden, evidence]);
  const current = (completedSerial === query?.serial ? items : []).filter(row => { try { parseLead(row); return true; } catch { return false; } });
  return {
    completedSerial, retryUntil,
    // Map-capable rows only; rows without any region are listed separately and never plotted.
    items: current.filter(isLocatedLead),
    contactItems: current.filter(row => !isLocatedLead(row)),
    busy: busy || !!query && completedSerial !== query.serial, error, hidden,
  };
}
