import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRoom } from '../__tests__/fixtures/chat';
import { chatMessage, chatRoomTitle, chatText, chatTime } from './chatCopy';
beforeEach(() => localStorage.setItem('user-locale', 'en-US'));
afterEach(() => vi.restoreAllMocks());
describe('chat display boundaries', () => {
  it('interpolates fixed UI templates once without interpreting original user placeholders', () => {
    expect(chatText('{title}，與{name}聊天{unread}', { title: '原名稱 {unread}', name: '原對象 {title}', unread: ', 2 unread' })).toBe('原名稱 {unread}, chat with 原對象 {title}, 2 unread');
    const original = makeRoom({ listing: { ...makeRoom().listing, title: '已封存的商品聊天' } });
    expect(chatRoomTitle(original)).toBe('已封存的商品聊天'); expect(chatRoomTitle({ ...original, listingId: null })).toBe('Archived item conversation');
  });
  it('never shows unknown diagnostics in either display language and retains Taiwan time', () => {
    expect(chatMessage('unknown private provider diagnostic')).toBe('The operation needs verification. Keep your content and retry reading.');
    expect(chatTime('2026-10-01T16:15:00.000Z')).toBe(new Date('2026-10-01T16:15:00.000Z').toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour12: false }));
    localStorage.setItem('user-locale', 'zh-TW'); expect(chatMessage('unknown private provider diagnostic')).toBe('操作需要重新查核；請保留內容並重試讀取。');
    expect(chatText('傳送訊息')).toBe('傳送訊息');
  });
});
