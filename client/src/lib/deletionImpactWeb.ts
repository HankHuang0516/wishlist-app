import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './marketplaceApi';

// APP 2.0.12's deletion-impact v2 contract, including preserved or detached data.
export const DELETION_IMPACT_LABELS = {
  reportsAuthored: '本人商品檢舉與證據', reportOperationReceipts: '本人檢舉收件與安全放棄回執',
  reportsOnOwnedListings: '隨本人刊登移除的檢舉案件', moderationActionsOnOwnedListings: '隨本人刊登移除的審核紀錄',
  moderationActionsDetachingOwnReports: '保留但解除本人案件關聯的審核紀錄',
  wishlists: '願望清單', wishes: '願望', wishCreateReceipts: '願望建立操作紀錄', listings: '刊登', uploadedPhotos: '商品照片',
  conversations: '需封存聊天室', messagesAuthored: '本人發送訊息', otherMessagesInSharedConversations: '保留對方自有訊息',
  meetupAppointments: '移除面交預約', upcomingMeetupAppointments: '其中尚未結束的預約',
  purchaseRecords: '解除帳號關聯的購買紀錄', giftClaimsInOtherWishlists: '解除他人願望代購占用',
  originalCreditsInOtherWishlists: '解除他人願望原始關聯', itemWatches: '商品關注', followRelationships: '追蹤關係',
  blockRelationships: '封鎖關係', feedbackRecords: '意見回報', crawlerRecords: '本人分析錯誤紀錄',
} as const;
export type DeletionImpact = { capturedAt: string; counts: Record<keyof typeof DELETION_IMPACT_LABELS, number> };
export function parseDeletionImpact(value: unknown): DeletionImpact {
  const record = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid deletion impact');
    return v as Record<string, unknown>;
  };
  const data = record(value), counts = record(data.counts);
  if (data.version !== 2 || data.previewOnly !== true || data.accountDeleted !== false ||
    typeof data.capturedAt !== 'string' || data.capturedAt.length > 40 || !Number.isFinite(Date.parse(data.capturedAt)) ||
    new Date(data.capturedAt).toISOString() !== data.capturedAt ||
    Object.keys(counts).sort().join(',') !== Object.keys(DELETION_IMPACT_LABELS).sort().join(',') ||
    !Object.values(counts).every(v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 2147483647))
    throw new Error('Invalid deletion impact');
  return { capturedAt: data.capturedAt, counts: counts as DeletionImpact['counts'] };
}

export function useDeletionImpact(token: string | null, userId: number | undefined, enabled: boolean) {
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const revision = useRef(0), inFlight = useRef(false), controller = useRef<AbortController | null>(null);
  const read = useCallback(async () => {
    if (!enabled || !token || !userId || inFlight.current) return;
    inFlight.current = true; const attempt = ++revision.current;
    const abort = new AbortController(); controller.current = abort; setState('loading');
    try {
      const body = await api<unknown>(token, '/users/me/deletion-impact', { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]) });
      const value = parseDeletionImpact(body);
      if (revision.current === attempt && !abort.signal.aborted) { setImpact(value); setState('ready'); }
    } catch {
      if (revision.current === attempt && !abort.signal.aborted) setState('failed');
    } finally {
      if (revision.current === attempt) { inFlight.current = false; controller.current = null; }
    }
  }, [enabled, token, userId]);
  useEffect(() => {
    setImpact(null); setState('idle'); void read();
    return () => { revision.current++; controller.current?.abort(); controller.current = null; inFlight.current = false; };
  }, [read]);
  return { impact, state, retry: read, canSubmit: state === 'ready' };
}
