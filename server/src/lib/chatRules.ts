import { isListingId } from './listingRules';
export class ChatInputError extends Error { constructor(message = '聊天資料格式不正確') { super(message); } }
export function chatObject(input: unknown, keys: string[]) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !keys.includes(key))) throw new ChatInputError();
    return input as Record<string, unknown>;
}
export function chatIdentity(value: unknown) { if (!isListingId(value)) throw new ChatInputError('識別碼不正確'); return value; }
export function chatSequence(value: unknown) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) throw new ChatInputError('訊息序號不正確'); return value;
}
export function parseTextMessage(input: unknown) {
    const body = chatObject(input, ['clientMessageId', 'text']); const clientMessageId = chatIdentity(body.clientMessageId);
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.trim().length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.text)) throw new ChatInputError('訊息須為1至2000字文字');
    return { clientMessageId, text: body.text.trim() };
}
export function parseChatPage(input: unknown, messages = false) {
    const query = chatObject(input, messages ? ['limit', 'beforeSequence', 'afterSequence'] : ['limit', 'cursor']);
    const numeric = (v: unknown) => { if (typeof v !== 'string' || !/^\d{1,10}$/.test(v)) throw new ChatInputError('分頁序號不正確'); return chatSequence(Number(v)); };
    const limit = query.limit === undefined ? 25 : numeric(query.limit);
    if (limit < 1 || limit > 50) throw new ChatInputError('每次最多50筆');
    const cursor = query.cursor === undefined ? undefined : chatIdentity(query.cursor);
    const beforeSequence = query.beforeSequence === undefined ? undefined : numeric(query.beforeSequence);
    const afterSequence = query.afterSequence === undefined ? undefined : numeric(query.afterSequence);
    if (beforeSequence !== undefined && (afterSequence !== undefined || beforeSequence === 0)) throw new ChatInputError('只能選擇一種訊息分頁方向');
    return { limit, cursor, beforeSequence, afterSequence };
}
