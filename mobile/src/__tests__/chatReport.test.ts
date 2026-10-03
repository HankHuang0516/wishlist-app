import { describe, it, expect } from 'vitest';
import { chatReportBody, chatReportReceipt } from '../chatReport';
const id = '745d5d99-547b-4df7-a417-a43723c34b67', room = '030d1520-34e4-4ae4-8f0b-808ef6448de0';
describe('private chat report admission', () => {
  it('preserves the original UUID, target, reason and message reference', () => {
    expect(chatReportBody(id, 2, 'OBJECTIONABLE', '  合成證據  ', room)).toEqual({ clientReportId: id, reportedUserId: 2, reason: 'OBJECTIONABLE', details: '合成證據', messageId: room });
  });
  it('rejects invalid targets, oversize evidence and foreign receipt identities', () => {
    expect(() => chatReportBody(id, 0, 'OTHER', '', null)).toThrow();
    expect(() => chatReportBody(id, 2, 'OTHER', 'x'.repeat(2001), null)).toThrow();
    const ack = { received: true, clientReportId: id, conversationId: room, receiptId: id };
    expect(chatReportReceipt(ack, room, id)).toBe(id);
    expect(() => chatReportReceipt({ ...ack, clientReportId: room }, room, id)).toThrow();
    expect(() => chatReportReceipt({ ...ack, received: false }, room, id)).toThrow();
  });
});
