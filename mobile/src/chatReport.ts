import { uuid } from './listingForm';
export const CHAT_REPORT_REASONS = [['HARASSMENT', '騷擾或威脅'], ['OBJECTIONABLE', '不當或仇恨內容'], ['FRAUD', '詐騙'], ['SPAM', '垃圾訊息'], ['OTHER', '其他']] as const;
export function chatReportBody(clientReportId: string, reportedUserId: number, reason: string, details: string, messageId: string | null) {
  if (!uuid(clientReportId) || !Number.isSafeInteger(reportedUserId) || reportedUserId < 1 ||
      !CHAT_REPORT_REASONS.some(([value]) => value === reason) || details.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(details) || messageId !== null && !uuid(messageId)) throw Error('檢舉資料不正確。');
  return { clientReportId, reportedUserId, reason, details: details.trim(), messageId };
}
export function chatReportReceipt(value: unknown, conversationId: string, clientReportId: string) {
  if (!value || typeof value !== 'object') throw Error('尚未確認收件。');
  const row = value as Record<string, unknown>;
  if (row.received !== true || row.conversationId !== conversationId || row.clientReportId !== clientReportId || !uuid(row.receiptId)) throw Error('尚未確認收件。');
  return row.receiptId;
}
