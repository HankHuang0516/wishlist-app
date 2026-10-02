import { getDisplayLocale } from '../utils/localization';
import { PendingStoreError } from './webPendingStore';
import type { ReportReason, ReportStatus } from './listingReports';

const english = {
  '檢舉商品：': 'Report item: ', '我的商品檢舉': 'My item reports', '關閉': 'Close',
  '登入後查看本人紀錄與恢復待確認操作。': 'Sign in to view your reports and recover unconfirmed operations.', '登入': 'Sign in',
  '只有本人及平台審核人員可見。送出不會立即下架；請勿填入密碼、證件或完整住址。': 'Only you and platform reviewers can see this report. Submitting does not immediately remove the item. Do not include passwords, identity documents or a full address.',
  '重試恢復原檢舉': 'Retry original report recovery', '待確認檢舉': 'Unconfirmed report',
  '有一件尚未確認結果的檢舉': 'One report has an unconfirmed outcome', '商品：': 'Item: ',
  '查核只讀取回執；重新送出會沿用原識別碼與原內容，不會新增另一件。': 'Checking only reads the receipt. Explicit resubmission uses the original identifier and content; it does not create another report.',
  '只查核原回執': 'Read original receipt only', '明確重新送出原檢舉': 'Explicitly resubmit original report',
  '安全放棄未收件操作': 'Safely abandon an unreceived operation', '確認安全放棄': 'Confirm safe abandonment',
  '只封存尚未收件的操作；已收件檢舉不會被撤回，也不會刪除商品。': 'Only an operation that has not been received is archived. A received report is not withdrawn, and the item is not deleted.',
  '返回查核': 'Back to receipt checking', '商品已停止刊登，不能送出新檢舉。': 'The item is no longer listed. A new report cannot be submitted.',
  '檢舉原因': 'Report reason', '補充說明（選填，最多1000字元）': 'Additional details (optional, up to 1000 characters)',
  '正在確認…': 'Checking…', '送出檢舉': 'Submit report', '我的檢舉紀錄': 'My report history',
  '更新紀錄': 'Refresh history', '正在讀取紀錄…': 'Loading history…', '尚無已收件紀錄。': 'No received reports yet.',
  '更新：': 'Updated: ', '（台灣時間）': ' (Taiwan time)', '載入更多紀錄': 'Load more history',
  '已確認收到檢舉；審核是否下架請查看狀態，不代表已下架。': 'Receipt confirmed. Check the review status to see whether the item is removed; receipt does not mean removal.',
  '未被收件的原操作已安全封存，不會稍後送出。': 'The original unreceived operation is safely archived and will not be sent later.',
  '原操作已收件，但沒有可顯示的案件明細；不代表撤回或下架。': 'The original operation was received, but no case details are available. This does not mean withdrawal or item removal.',
  '後台結果已確認，但本機待確認標記尚未清除。請查核原回執；暫不建立新檢舉。': 'The server outcome is confirmed, but the local pending marker remains. Check the original receipt; do not create a new report yet.',
  '無法讀取檢舉紀錄；不代表沒有紀錄，請重試。': 'Report history could not be read. This does not mean there are no reports; retry explicitly.',
  '無法安全恢復原檢舉。請重試恢復；未恢復前不會送出新的檢舉。': 'The original report could not be safely recovered. Retry recovery; no new report will be sent before recovery.',
  '登入已失效；原檢舉已保留，重新登入後請查回執，不代表送出成功或失敗。': 'Your sign-in has expired. The original report is retained. Sign in again and check its receipt; this is not confirmation of success or failure.',
  '原識別碼或內容有衝突；請先查原回執，不要建立另一筆檢舉。': 'The original identifier or content conflicts. Check the original receipt before creating another report.',
  '尚未確認檢舉結果；原內容已保留。請先查回執，查不到也不代表已取消。': 'The report outcome is unconfirmed; the original content is retained. Check the receipt first. A missing receipt does not mean cancellation.',
  '檢舉資料或回應格式不正確。': 'The report data or response is invalid.', '請選擇檢舉原因。': 'Choose a report reason.',
  '補充說明限1000字元，不可含無效控制字元。': 'Additional details are limited to 1000 characters and cannot contain invalid control characters.',
  '回執與原檢舉內容不符，尚未確認成功。': 'The receipt does not match the original report. Success is unconfirmed.',
  '操作回執與原檢舉不符，尚未確認。': 'The operation receipt does not match the original report. The outcome is unconfirmed.',
  '本機檢舉資料無法安全保存或讀取。請保留此頁文字，再重試恢復；不會送出新檢舉。': 'Local report data could not be safely saved or read. Keep this page text and retry recovery; no new report will be sent.',
  '結果尚未確認。請保留此頁文字，並查核原回執或重試恢復；不會自動送出。': 'The outcome is unconfirmed. Keep this page text and check the original receipt or retry recovery; nothing is sent automatically.',
} as const;
export type ReportCopyKey = keyof typeof english;
const chinese = () => getDisplayLocale().startsWith('zh');
export function reportText(key: ReportCopyKey): string { return chinese() ? key : english[key]; }
export function reportMessageKey(message: unknown): ReportCopyKey {
  return typeof message === 'string' && Object.prototype.hasOwnProperty.call(english, message)
    ? message as ReportCopyKey : '結果尚未確認。請保留此頁文字，並查核原回執或重試恢復；不會自動送出。';
}
export function reportFailureKey(error: unknown): ReportCopyKey {
  return error instanceof PendingStoreError ? '本機檢舉資料無法安全保存或讀取。請保留此頁文字，再重試恢復；不會送出新檢舉。'
    : reportMessageKey(error instanceof Error ? error.message : null);
}
const reasons: Record<ReportReason, readonly [string, string]> = {
  PROHIBITED: ['禁售商品', 'Prohibited item'], FRAUD: ['疑似詐騙／內容不符', 'Suspected fraud / misleading content'],
  HARASSMENT: ['騷擾或不當內容', 'Harassment or inappropriate content'], SPAM: ['垃圾或重複刊登', 'Spam or duplicate listing'], OTHER: ['其他', 'Other'],
};
const statuses: Record<ReportStatus, readonly [string, string]> = {
  OPEN: ['已收件，待審核', 'Received, awaiting review'], DISMISSED: ['審核已結束，未下架', 'Review finished, item not removed'], REMOVED: ['審核已結束，商品已下架', 'Review finished, item removed'],
};
export function reportReasonLabel(reason: ReportReason): string { return reasons[reason][chinese() ? 0 : 1]; }
export function reportStatusLabel(status: ReportStatus): string { return statuses[status][chinese() ? 0 : 1]; }
export function reportTime(value: string): string { return new Date(value).toLocaleString(chinese() ? 'zh-TW' : 'en-US', { timeZone: 'Asia/Taipei' }); }
