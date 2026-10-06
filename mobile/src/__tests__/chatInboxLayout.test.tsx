import React, { type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChatInboxList, type SourceInquiryThread } from '../ChatInboxList';
import { SafeAreaModal } from '../SafeAreaModal';
import type { ChatRoomRecord } from '../chatData';

// Inspect the actual component's element tree without loading native modules in
// Node. This checks scroll ownership and navigation, not native pixel geometry.
vi.mock('react-native', () => ({
  Modal: 'Modal', SectionList: 'SectionList', ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
vi.mock('../PrivateListingPhoto', () => ({ PrivateListingPhoto: 'PrivateListingPhoto' }));

type Element = ReactElement<Record<string, any>>;
function elements(node: ReactNode): Element[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement(child)
    ? [child as Element, ...elements((child as Element).props.children)] : []);
}
function text(node: ReactNode): string {
  return React.Children.toArray(node).map(child => React.isValidElement(child)
    ? text((child as Element).props.children) : String(child)).join('');
}
function room(index: number): ChatRoomRecord {
  return { id: 'room-' + index, listingId: 'listing-' + index, buyerUserId: 1, sellerUserId: 2, archived: false,
    lastMessageSequence: 1, lastReadSequence: 0, unreadCount: 1, blocked: false, blockedByMe: false, blockedByOther: false,
    listingAvailable: true, lastMessageAt: '2026-10-06T12:00:00Z', lastMessageText: '真人測試訊息',
    buyer: { id: 1, name: '買方' }, seller: { id: 2, name: '賣方' },
    listing: { id: 'listing-' + index, title: '商品 ' + index, status: 'ACTIVE', expiresAt: null, price: 100, currency: 'TWD', thumbnailUrl: null } };
}
function thread(index: number): SourceInquiryThread {
  return { id: 'source-' + index, state: 'WAITING_ROUTE', context: { id: 'source-' + index, title: '代問 ' + index,
    canonicalUrl: 'https://example.com/' + index, county: '臺南市', district: '永康區', priceText: '售價待詢問' } };
}
function fixture() {
  return { rooms: Array.from({ length: 25 }, (_, i) => room(i)), sourceThreads: Array.from({ length: 25 }, (_, i) => thread(i)),
    userId: 1, apiUrl: 'https://example.com/api', token: '', busy: false, error: '', sourceError: '', cursor: 'people-next', sourceCursor: 'ai-next',
    onRoomChange: vi.fn(), onSourceChatChange: vi.fn(), onRefresh: vi.fn(), onLoadMore: vi.fn(), onRefreshSources: vi.fn(), onLoadMoreSources: vi.fn() };
}

describe('chat inbox scroll and navigation regression', () => {
  it('keeps 25 AI inquiries and 25 real conversations in one expanding scroll viewport, with people first', () => {
    const props = fixture(), list = ChatInboxList(props) as Element;
    expect(list.type).toBe('SectionList');
    expect(list.props.style.flex).toBe(1);
    expect(list.props.sections.map((section: any) => section.kind)).toEqual(['person', 'ai']);
    expect(list.props.sections.map((section: any) => section.data.length)).toEqual([25, 25]);
    expect(elements(list.props.children)).toHaveLength(0);
    expect(text(list.props.ListHeaderComponent)).not.toContain('代問');
    expect(text(list.props.ListHeaderComponent)).not.toContain('真人測試訊息');
    const allKeys = list.props.sections.flatMap((section: any) => section.data.map(list.props.keyExtractor));
    expect(new Set(allKeys).size).toBe(50);
  });

  it('opens the final real conversation and final AI inquiry through their own row actions', () => {
    const props = fixture(), list = ChatInboxList(props) as Element;
    const people = list.props.renderItem({ item: list.props.sections[0].data[24] }) as Element;
    const ai = list.props.renderItem({ item: list.props.sections[1].data[24] }) as Element;
    expect(people.props.accessibilityLabel).toContain('與賣方聊天');
    expect(text(people)).toContain('真人測試訊息');
    people.props.onPress(); ai.props.onPress();
    expect(props.onRoomChange).toHaveBeenCalledWith('room-24');
    expect(props.onSourceChatChange).toHaveBeenCalledWith(props.sourceThreads[24].context);
  });

  it('keeps pagination and refresh actions inside the shared scroll content', () => {
    const props = fixture(), list = ChatInboxList(props) as Element;
    for (const section of list.props.sections) {
      const footer = list.props.renderSectionFooter({ section });
      for (const button of elements(footer).filter(node => node.type === 'Pressable')) button.props.onPress();
    }
    expect(props.onLoadMore).toHaveBeenCalledOnce(); expect(props.onRefresh).toHaveBeenCalledOnce();
    expect(props.onLoadMoreSources).toHaveBeenCalledOnce(); expect(props.onRefreshSources).toHaveBeenCalledOnce();
  });

  it('shows empty or failed real-chat state without hiding existing AI inquiries', () => {
    const props = fixture(); props.rooms = [];
    const empty = ChatInboxList(props) as Element;
    expect(text(empty.props.renderSectionFooter({ section: empty.props.sections[0] }))).toContain('目前沒有真人商品聊天');
    props.error = '聊天暫時無法載入';
    const failed = ChatInboxList(props) as Element;
    const footer = failed.props.renderSectionFooter({ section: failed.props.sections[0] });
    expect(text(footer)).toContain(props.error); expect(text(footer)).not.toContain('目前沒有真人商品聊天');
    expect(failed.props.sections[1].data).toHaveLength(25);
  });
});

describe('full-screen modal safe-area regression', () => {
  it('measures top, bottom and side safe areas in the modal window before its header and controls', () => {
    const onClose = vi.fn();
    const modal = SafeAreaModal({ visible: true, animationType: 'slide', onRequestClose: onClose, children: <TextContent /> }) as Element;
    const provider = modal.props.children as Element, safe = provider.props.children as Element;
    expect(modal.type).toBe('Modal'); expect(modal.props.presentationStyle).toBe('fullScreen');
    expect(provider.type).toBe('SafeAreaProvider'); expect(safe.type).toBe('SafeAreaView');
    expect(safe.props.edges).toEqual(expect.arrayContaining(['top', 'bottom', 'left', 'right']));
    expect(safe.props.style[0].flex).toBe(1);
    expect(safe.props.children.type).toBe(TextContent);
    modal.props.onRequestClose(); expect(onClose).toHaveBeenCalledOnce();
  });
});
function TextContent() { return <></>; }
