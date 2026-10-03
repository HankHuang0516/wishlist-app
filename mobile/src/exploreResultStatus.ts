/** Counts describe loaded rows by kind, never a cross-source unique inventory total. */
export type LoadedSourceState = { count: number; busy: boolean; ready: boolean; error: string; hasMore: boolean; enabled: boolean; skipped: boolean };
export function exploreResultStatus(seller: LoadedSourceState, external: LoadedSourceState, leads: LoadedSourceState) {
  const states = [seller, external, leads];
  const loading = states.some(s => !s.skipped && (s.busy || !s.ready));
  const failed = states.some(s => !s.skipped && !!s.error);
  const more = states.some(s => !s.skipped && s.hasMore);
  const empty = !loading && !failed && !more && states.every(s => s.skipped || !s.enabled || s.count === 0);
  const part = (s: LoadedSourceState, label: string, unit: string) => s.skipped ? `${label}：此條件未查` : s.busy || !s.ready ? `${label}：讀取中` : s.error ? `${label}：讀取失敗` : !s.enabled ? `${label}：未開放` : `${label}已載入 ${s.count} ${unit}${s.hasMore ? '，還有更多' : ''}`;
  return { empty, loading, failed, more, summary: [part(seller, '站內刊登', '件'), part(external, '授權外部商品', '件'), part(leads, '待確認來源', '筆')].join('｜'),
    notice: loading ? '仍在讀取搜尋結果；尚不能判定沒有商品。' : failed ? '部分來源讀取失敗；已載入結果仍可查看，失敗不代表0件。' : more ? '此範圍仍有下一頁；地圖與件數只顯示已載入資料，請切換清單載入更多。' : empty ? '此搜尋範圍未找到符合條件的結果，不代表全站沒有商品。' : '' };
}
