import { getDisplayLocale } from '../utils/localization';
const english = {
  '系統診斷': 'System diagnostics',
  '測試郵件': 'Test email',
  '僅後台指定的管理者可寄到固定管理信箱。郵件服務接受不等於收件匣送達。': 'Only administrators admitted by the server may send to the fixed management mailbox. Mail service acceptance does not confirm inbox delivery.',
  '診斷權限尚未確認；沒有送出。': 'Diagnostic permission is unconfirmed. Nothing was sent.',
  '無法安全保存或讀取本機操作；暫停送出，請重試讀取。': 'The local operation could not be saved or read safely. Sending is paused. Retry reading.',
  '正在處理…': 'Working…',
  '寄送測試郵件': 'Send test email',
  '重試讀取診斷權限與提醒': 'Retry reading diagnostic permission and reminder',
  '寄送結果未確認；重開不會自動重送。': 'Sending is unconfirmed. Reopening never resends automatically.',
  '本機標記不是後台回執。請到郵件服務核對；重新讀取權限不能證明原郵件結果。': 'The local marker is not a server receipt. Check the mail service. Rereading permission cannot prove the original mail result.',
  '我已到郵件服務核對，了解清理不會取消原請求': 'I checked the mail service and understand cleanup does not cancel the original request',
  '只清理本機提醒': 'Clear local reminder only',
  '郵件服務已接受測試請求；尚未確認收件匣送達。': 'The mail service accepted the test request. Inbox delivery is unconfirmed.',
  '後台拒絕這次操作；沒有寄送。': 'The server rejected this operation. No mail was sent.',
  '回覆已核對；本機提醒尚未清理，只需重試清理。': 'The reply was verified. The local reminder needs cleanup. Retry cleanup only.',
  '另一份本機操作仍存在，請重新讀取。': 'Another local operation remains. Read it again.',
  '本機操作標記': 'Local operation marker',
} as const;
export function diagnosticsText(key: keyof typeof english) { return getDisplayLocale().startsWith('zh') ? key : english[key]; }
