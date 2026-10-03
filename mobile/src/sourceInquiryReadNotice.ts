/** A failed read cannot prove that an earlier write was never accepted. */
export function sourceInquiryReadNotice(input: {
  busy: boolean; error: string; hasPending: boolean; hasRoom: boolean; status: string;
}) {
  if (input.hasPending) return '原請求結果尚未確認；保留同一識別碼，只能更新核對或重試同一筆，不建立替代問題。';
  if (input.error) return input.hasRoom
    ? '更新失敗；下列為上次已讀詢問與回執，最新狀態仍待核對。' + input.status
    : '尚未讀取成功，無法判定既有詢問狀態；請重新讀取。';
  if (input.busy) return input.hasRoom
    ? '正在更新既有詢問；先前回執仍保留。' + input.status
    : '正在讀取原詢問；尚未發起新的問題。';
  return input.status;
}
