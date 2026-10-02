import { useEffect, useState } from 'react';
import { api, ApiFailure } from './marketplaceApi';
import { parseLeadPage, parseLead, type SourceLead } from './sourceLeadData';
import type { ExploreQuery } from './exploreWeb';
const sourceSearchError = '來源線索未完成讀取，已暫停自動更新；不代表沒有資料，請明確重新搜尋。' as const;

export function useSourceLeadSearch(token: string, query: ExploreQuery | null) {
  const [items, setItems] = useState<SourceLead[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState<'' | typeof sourceSearchError>('');
  const [completedSerial, setCompletedSerial] = useState(0), [retryUntil, setRetryUntil] = useState(0);
  const hidden = !!query && (!!query.wishId || !!query.filters.brand || !!query.filters.category || !!query.filters.delivery || !!query.filters.condition || !!query.filters.minPrice || !!query.filters.maxPrice || query.filters.q.length > 80);
  useEffect(() => {
    let active = true, loading = false, paused = false;
    const controller = new AbortController();
    setItems([]); setError(''); setCompletedSerial(0); setRetryUntil(0); setBusy(!!query && !hidden);
    if (!query || hidden) { if (query) setCompletedSerial(query.serial); return () => controller.abort(); }
    async function load() {
      if (loading || paused) return;
      loading = true;
      try {
        const rows: SourceLead[] = [], seen = new Set<string>();
        let cursor: string | null = null;
        do {
          const path = '/source-leads?presentation=1&bbox=' + query!.bounds.join(',') + '&q=' + encodeURIComponent(query!.filters.q) + (cursor ? '&cursor=' + cursor : '');
          const page = parseLeadPage(await api<unknown>(token, path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) }));
          rows.push(...page.items); cursor = page.nextCursor;
          if (cursor && seen.has(cursor)) throw Error();
          if (cursor) seen.add(cursor);
          if (rows.length >= 500 && cursor) throw Error();
        } while (cursor);
        if (active) setItems([...new Map(rows.map(row => [row.id, row])).values()]);
      } catch (failure) {
        // Expiry of an API cooldown or a timer never authorizes another search.
        // A new user-submitted query creates a new effect and resumes reads.
        paused = true;
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
  }, [token, query, hidden]);
  return {
    completedSerial, retryUntil,
    items: (completedSerial === query?.serial ? items : []).filter(row => { try { parseLead(row); return true; } catch { return false; } }),
    busy: busy || !!query && completedSerial !== query.serial, error, hidden,
  };
}
