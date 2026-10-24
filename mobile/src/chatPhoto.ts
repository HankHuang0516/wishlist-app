import { ChatDataError, parseChatMessage, type ChatRoomRecord } from './chatData';
export type PhotoMessageRequest = { clientMessageId: string; text: string; photoHash: string };
export function photoMessageRequest(value: unknown): PhotoMessageRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ChatDataError();
  const r = value as Record<string, unknown>;
  if (Object.keys(r).sort().join(',') !== 'clientMessageId,photoHash,text' ||
    typeof r.clientMessageId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(r.clientMessageId) ||
    typeof r.photoHash !== 'string' || !/^[a-f0-9]{64}$/.test(r.photoHash) || typeof r.text !== 'string' ||
    !r.text.trim() || r.text !== r.text.trim() || r.text.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(r.text)) throw new ChatDataError();
  return { clientMessageId: r.clientMessageId, text: r.text, photoHash: r.photoHash };
}
export function photoMessageReceipt(value: unknown, room: ChatRoomRecord, userId: number, original: PhotoMessageRequest) {
  const m = parseChatMessage(value, room);
  if (m.senderUserId !== userId || m.clientMessageId !== original.clientMessageId || m.text !== original.text || m.photoHash !== original.photoHash) throw new ChatDataError('照片回執與原傳送內容不符');
  return m;
}
