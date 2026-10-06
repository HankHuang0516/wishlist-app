import React from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatRoomRecord } from './chatData';
import type { SourceChatContext } from './SourceLeadExplorer';
import { PrivateListingPhoto } from './PrivateListingPhoto';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';

export type SourceInquiryThread = { id: string; state: string; context: SourceChatContext };
type Row = { kind: 'person'; room: ChatRoomRecord } | { kind: 'ai'; thread: SourceInquiryThread };
type Section = { kind: 'person' | 'ai'; title: string; data: Row[] };
type Props = {
  rooms: ChatRoomRecord[]; sourceThreads: SourceInquiryThread[]; userId: number; apiUrl: string; token: string;
  busy: boolean; error: string; sourceError: string; cursor: string | null; sourceCursor: string | null;
  onRoomChange: (id: string) => void; onSourceChatChange?: (context: SourceChatContext) => void;
  onRefresh: () => void; onLoadMore: () => void; onRefreshSources: () => void; onLoadMoreSources: () => void;
};

export function ChatInboxList(props: Props) {
  const { rooms, sourceThreads, userId, apiUrl, token, busy, error, sourceError, cursor, sourceCursor } = props;
  const sections: Section[] = [
    { kind: 'person', title: '真人商品聊天', data: rooms.map(room => ({ kind: 'person', room })) },
    { kind: 'ai', title: 'Wishlist AI 代問', data: sourceThreads.map(thread => ({ kind: 'ai', thread })) },
  ];
  // One bounded scroll viewport owns both sections, including their headings,
  // empty states and pagination. AI cards cannot take height from the chat list.
  return <SectionList<Row, Section> style={s.screen} contentContainerStyle={s.list}
    sections={sections} stickySectionHeadersEnabled={false}
    keyExtractor={item => item.kind === 'person' ? 'person:' + item.room.id : 'ai:' + item.thread.id}
    ListHeaderComponent={<View style={s.header}><Text accessibilityRole="header" style={s.heading}>聊天與面交</Text>
      <Text style={s.subtitle}>與買家或賣家聯繫，討論商品細節並約面交。</Text>
      {busy && <ActivityIndicator accessibilityLabel="載入聊天中" />}
    </View>}
    renderSectionHeader={({ section }) => <Text accessibilityRole="header" style={s.sectionTitle}>{section.title}</Text>}
    renderItem={({ item }) => {
      if (item.kind === 'ai') {
        const { thread } = item;
        return <Pressable accessibilityRole="button" accessibilityLabel={`${thread.context.title}，Wishlist AI 代問`}
          style={s.card} onPress={() => props.onSourceChatChange?.(thread.context)}>
          <View style={s.body}><Text numberOfLines={2} style={s.title}>{thread.context.title}</Text>
            <Text style={s.preview}>Wishlist AI · {thread.state === 'WAITING_ROUTE' ? '待核實原賣家，未送出' : thread.state === 'DELIVERED' ? '已代轉，等待賣家回覆' : thread.state === 'CANCELLED' ? '已取消' : '查看問題與下一步'}</Text>
          </View>
        </Pressable>;
      }
      const { room } = item;
      const contact = (room.buyerUserId === userId ? room.seller.name : room.buyer.name) || (room.archived ? '已移除的帳號' : '商品聯絡人');
      const price = room.listing.price === null ? '售價未提供' : `NT$${room.listing.price.toLocaleString('zh-TW')}`;
      return <Pressable accessibilityRole="button" accessibilityLabel={`${room.listing.title}，與${contact}聊天${room.unreadCount ? `，${room.unreadCount} 則未讀` : ''}`}
        style={s.card} onPress={() => props.onRoomChange(room.id)}>
        <View style={s.photoShell}>{room.listingAvailable && room.listing.thumbnailUrl && token
          ? <PrivateListingPhoto thumbnailUrl={room.listing.thumbnailUrl} apiUrl={apiUrl} token={token} label="聊天商品照片" style={s.photo} qaStatus={false} />
          : <Ionicons name="image-outline" size={25} color={iosColors.tertiaryLabel} />}</View>
        <View style={s.body}><View style={s.top}><Text numberOfLines={1} style={s.title}>{room.listing.title}</Text>
          <Text style={s.time}>{new Date(room.lastMessageAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</Text></View>
          <Text numberOfLines={1} style={s.contact}>與 {contact} · {price}</Text>
          <Text numberOfLines={1} style={s.preview}>{room.archived ? '已封存 · 僅供查看' : room.blocked ? '已封鎖 · 歷史仍可查看' : !room.listingAvailable ? '商品已停止刊登 · 歷史仍可查看' : room.lastMessageText || '開始討論這件商品'}</Text>
        </View>{room.unreadCount > 0 && <View style={s.unreadDot} accessibilityLabel={`${room.unreadCount} 則未讀`} />}
      </Pressable>;
    }}
    renderSectionFooter={({ section }) => section.kind === 'person' ? <View style={s.footer}>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {!rooms.length && !busy && !error && <Text style={s.subtitle}>目前沒有真人商品聊天。當有買家或賣家聯繫時，對話會顯示在這裡。</Text>}
      {cursor && <Pressable accessibilityRole="button" disabled={busy} style={s.button} onPress={props.onLoadMore}><Text style={s.buttonText}>載入較早的聊天</Text></Pressable>}
      <Pressable accessibilityRole="button" disabled={busy} style={s.button} onPress={props.onRefresh}><Text style={s.buttonText}>重新載入聊天</Text></Pressable>
    </View> : <View style={s.footer}>
      {!!sourceError && <Text accessibilityRole="alert" style={s.error}>{sourceError}</Text>}
      {!sourceThreads.length && !sourceError && <Text style={s.subtitle}>目前沒有 Wishlist AI 代問。</Text>}
      {sourceCursor && <Pressable accessibilityRole="button" style={s.button} onPress={props.onLoadMoreSources}><Text style={s.buttonText}>載入較早代問</Text></Pressable>}
      <Pressable accessibilityRole="button" style={s.button} onPress={props.onRefreshSources}><Text style={s.buttonText}>更新代問收件</Text></Pressable>
    </View>} />;
}

const s = StyleSheet.create({
  screen: { flex: 1 }, list: { paddingHorizontal: iosSpacing.md, paddingBottom: iosSpacing.lg },
  header: { paddingTop: iosSpacing.lg, paddingBottom: iosSpacing.sm, gap: iosSpacing.xxs },
  heading: { ...iosType.title, color: iosColors.label }, subtitle: { ...iosType.subheadline, color: iosColors.secondaryLabel },
  sectionTitle: { ...iosType.headline, color: iosColors.label, paddingTop: iosSpacing.md, paddingBottom: iosSpacing.sm },
  card: { minHeight: 88, padding: iosSpacing.sm, marginBottom: iosSpacing.sm, borderRadius: iosRadius.card,
    backgroundColor: iosColors.surface, flexDirection: 'row', alignItems: 'center', gap: iosSpacing.sm, ...iosShadow },
  body: { flex: 1, minWidth: 0, gap: iosSpacing.xxs }, top: { flexDirection: 'row', alignItems: 'center', gap: iosSpacing.xs },
  title: { ...iosType.headline, color: iosColors.label, flex: 1 }, time: { ...iosType.footnote, color: iosColors.secondaryLabel },
  contact: { ...iosType.footnote, color: iosColors.label }, preview: { ...iosType.footnote, color: iosColors.secondaryLabel },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: iosColors.tint },
  photoShell: { width: 56, height: 56, borderRadius: iosRadius.small, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: iosColors.surfaceSecondary },
  photo: { width: 56, height: 56, borderRadius: iosRadius.small }, footer: { gap: iosSpacing.sm, paddingBottom: iosSpacing.sm },
  button: { minHeight: minimumTapSize, padding: iosSpacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator,
    borderRadius: iosRadius.control, backgroundColor: iosColors.surface, alignItems: 'center', justifyContent: 'center' },
  buttonText: { ...iosType.subheadline, color: iosColors.tint }, error: { ...iosType.subheadline, color: iosColors.danger },
});
