import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicApi } from '../lib/marketplaceApi';
import { getDisplayLocale } from '../utils/localization';

/** A missing, failed or zero count never appears as a public statistic. */
export default function PublicSourceCount() {
  const [count, setCount] = useState<number | null>(null);
  const english = getDisplayLocale() === 'en-US';
  useEffect(() => {
    const controller = new AbortController();
    publicApi<unknown>('/source-leads/summary', { signal: controller.signal })
      .then(value => {
        if (controller.signal.aborted || !value || typeof value !== 'object') return;
        const result = value as { count?: unknown; enabled?: unknown };
        if (result.enabled === true && typeof result.count === 'number' && Number.isSafeInteger(result.count) && result.count > 0)
          setCount(result.count);
      }).catch(() => { /* Optional statistic: retain absence on failure. */ });
    return () => controller.abort();
  }, []);
  if (count === null) return null;
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600" data-public-source-count={count}>
    <Link to="/explore" className="inline-flex min-h-11 items-center font-medium text-green-800 underline underline-offset-4">
      {english ? `Public sources: ${count.toLocaleString('en-US')} records` : `公開來源：${count.toLocaleString('zh-TW')} 筆`}
    </Link>
    <span className="text-xs">{english ? 'Reference information · Availability unconfirmed' : '資料參考 · 庫存待確認'}</span>
  </div>;
}
