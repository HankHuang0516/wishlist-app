import { randomUUID } from 'crypto';
import { chatIdentity, chatObject, chatSequence, parseChatPage, parseTextMessage } from '../lib/chatRules';
describe('strict first-party text chat rules', () => {
    it('normalizes text while preserving line breaks and Unicode', () => {
        const clientMessageId = randomUUID(); expect(parseTextMessage({ clientMessageId, text: '  您好👋\n週六可以面交嗎？  ' })).toEqual({ clientMessageId, text: '您好👋\n週六可以面交嗎？' });
    });
    it.each([null, [], 'text', {}, { text: 'hello' }, { clientMessageId: randomUUID(), text: '' }, { clientMessageId: randomUUID(), text: ' \n\t' },
        { clientMessageId: randomUUID(), text: 'x'.repeat(2001) }, { clientMessageId: '../private', text: 'hello' }, { clientMessageId: randomUUID(), text: 12 },
        { clientMessageId: randomUUID(), text: 'hello\u0000' }, { clientMessageId: randomUUID(), text: 'hello', senderUserId: 1 },
        { clientMessageId: randomUUID(), text: 'hello', type: 'MEETUP' }, { clientMessageId: randomUUID(), text: 'hello', payload: { latitude: 25.03 } },
    ])('rejects malformed payloads, sender spoofing and unofficial attachments %j', value => expect(() => parseTextMessage(value)).toThrow());
    it('bounds text to 2000 UTF-16 units', () => expect(parseTextMessage({ clientMessageId: randomUUID(), text: 'x'.repeat(2000) }).text).toHaveLength(2000));
    it.each([null, -1, NaN, Infinity, '1', 1.1, 2147483648])('rejects unsafe sequence %j', value => expect(() => chatSequence(value)).toThrow());
    it.each([0, 1, 2147483647])('accepts bounded sequence %j', value => expect(chatSequence(value)).toBe(value));
    it('rejects unknown fields in all chat objects', () => expect(() => chatObject({ admin: true }, [])).toThrow());
    it('validates only UUID route identities', () => { const id = randomUUID(); expect(chatIdentity(id)).toBe(id); expect(() => chatIdentity(1)).toThrow(); });
    it('defaults to 25 rows, supports all bounded directions', () => {
        expect(parseChatPage({})).toMatchObject({ limit: 25 }); const cursor = randomUUID(); expect(parseChatPage({ limit: '50', cursor })).toMatchObject({ limit: 50, cursor });
        expect(parseChatPage({ limit: '1', afterSequence: '0' }, true)).toMatchObject({ limit: 1, afterSequence: 0 }); expect(parseChatPage({ beforeSequence: '10' }, true).beforeSequence).toBe(10);
    });
    it.each([{ limit: '0' }, { limit: '51' }, { limit: '1.1' }, { limit: '1e2' }, { limit: 1 }, { limit: '99999999999' }, { cursor: '../private' }, { afterSequence: '1' }, { q: 'private' }])('rejects invalid inbox pages %j', query => expect(() => parseChatPage(query)).toThrow());
    it.each([{ beforeSequence: '0' }, { beforeSequence: '1', afterSequence: '0' }, { afterSequence: '-1' }, { afterSequence: '2147483648' }, { cursor: randomUUID() }, { senderUserId: '1' }])('rejects invalid message pages %j', query => expect(() => parseChatPage(query, true)).toThrow());
});
