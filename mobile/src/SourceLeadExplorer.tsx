import { NativeInquiryAllowance } from './NativeBilling';
import {SourceLeadDetailContent} from './SourceLeadDetailContent';
import {ProductInterest} from './ProductInterestView';
import {useNativeSourceInquiry} from './useNativeSourceInquiry';
import {sourceContactText as t} from './sourceContactCopy';
import {NativeDisclosure} from './NativeDisclosure';
import { iosColors } from './iosTheme';
import { DeviceEventEmitter } from 'react-native';
import { useSourceReplyRead } from './useSourceReplyRead';
import { ChatMessageBubble, chatPresentation } from './ChatPresentation';
import { ListingPhoto, listingPresentation } from './ListingPhoto';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Linking, AppState, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaModal } from './SafeAreaModal';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import * as Crypto from 'expo-crypto';
import type { FeatureCollection, Point } from 'geojson';
import { createApi, ApiError } from './api';
import type { Bounds } from './listingSearch';
import { uuid } from './listingForm';
import { pendingRequestKey, privatePendingStore } from './nativePendingStore';
import { sourceLocationLabel, isLocatedLead, type LocatedSourceLead, parseLeadPage, parseLead, parseLeadRoom, type SourceLead, type LeadRoom, type ContactRouting } from './sourceLeadData';
export type SourceChatContext = {id:string;title:string;canonicalUrl:string;county:string;district:string;priceText:string;thumbnailUrl?:string;contactRouting?:ContactRouting;locationPrecision?:'COUNTY_ILLUSTRATION'|'CONTACT_FOR_LOCATION'};
export const sourceChatContext=(r:SourceLead):SourceChatContext=>({id:r.id,title:r.title,canonicalUrl:r.canonicalUrl,county:r.county??'',district:r.district??'',locationPrecision:r.locationPrecision,priceText:r.publicFacts?.priceText||"售價待詢問",thumbnailUrl:r.media?.[0]?.thumbnailUrl,contactRouting:r.contactRouting});
export function useSourceLeads({ api, apiUrl, userId, bounds, q, hidden, onOpenSourceChat,initialSourceId,onInitialSourceHandled }: {
    api: ReturnType<typeof createApi>;
    apiUrl: string;
    userId: number;
    bounds: Bounds | null;
    q: string;
    hidden: boolean;
    onOpenSourceChat:(context:SourceChatContext)=>void;
    initialSourceId?:string|null;onInitialSourceHandled?:()=>void;
}) {
    const [items, setItems] = useState<SourceLead[]>([]), [cursor, setCursor] = useState<string | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [detail, setDetail] = useState<SourceLead | null>(null), [groupIds, setGroupIds] = useState<string[]>([]);
    const pendingSourceRoute=useRef<SourceChatContext|null>(null);
    const generation = useRef(0), alive = useRef(true), inflight = useRef(false), detailGeneration = useRef(0);
    const path = bounds && !hidden ? '/source-leads?bbox=' + bounds.join(',') + '&presentation=1&approximate=1&q=' + encodeURIComponent(q) : null;
    async function load(next?: string) { if (!path || inflight.current)
        return; const seq = generation.current; inflight.current = true; setBusy(true); try {
        const page = parseLeadPage(await api<unknown>(path + (next ? '&cursor=' + next : '')));
        if (alive.current && seq === generation.current) {
            if (next && page.nextCursor === next)
                throw new Error('分頁未前進');
            setItems(old => next ? [...new Map([...old, ...page.items].map(r => [r.id, r])).values()] : page.items);
            setCursor(page.nextCursor);
            setError('');
        }
    }
    catch {
        if (alive.current && seq === generation.current)
            setError('來源線索暫時無法讀取，請重試。');
    }
    finally {
        if (seq === generation.current) {
            inflight.current = false;
            if (alive.current) {
                setBusy(false);
                setReady(true);
            }
        }
    } }
    useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; detailGeneration.current++; }; }, []);
    useEffect(() => { generation.current++; inflight.current = false; setError(''); setItems([]); setCursor(null); setDetail(null); setGroupIds([]); setBusy(false); setReady(!path); if (path)
        void load(); }, [path, api]);
    useEffect(() => { function expire() { setItems(old => old.filter(r => { try {
        parseLead(r);
        return true;
    }
    catch {
        return false;
    } })); setDetail(old => { if (!old)
        return null; try {
        parseLead(old);
        return old;
    }
    catch {
        detailGeneration.current++;
        return null;
    } }); } const timer = setInterval(expire, 30000); const sub = AppState.addEventListener('change', state => { if (state === 'active') {
        expire();
        void load();
    } }); return () => { clearInterval(timer); sub.remove(); }; }, [path, api]);
    async function open(id: string) { const seq = ++detailGeneration.current; setGroupIds([]); setError(''); try {
        const r = parseLead(await api<unknown>('/source-leads/' + id + '?presentation=1&photos=2&approximate=1&unlocated=1'));
        if (r.id !== id)
            throw new Error();
        if (alive.current && seq === detailGeneration.current) { setDetail(r); return true; }
    }
    catch {
        if (alive.current && seq === detailGeneration.current) {
            setDetail(null);
            setError('線索已撤回或超過日期範圍，請重新搜尋。');
        }
    } return false; }
    useEffect(()=>{if(initialSourceId&&uuid(initialSourceId))void open(initialSourceId).finally(()=>onInitialSourceHandled?.());},[initialSourceId,api]);
    const groups = new Map<string, LocatedSourceLead[]>();
    for (const r of items.filter(isLocatedLead)) {
        const key = r.longitude + ',' + r.latitude;
        groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const data: FeatureCollection<Point> = { type: 'FeatureCollection', features: [...groups.values()].map(rows => ({ type: 'Feature', id: rows[0].id, geometry: { type: 'Point', coordinates: [rows[0].longitude, rows[0].latitude] }, properties: { id: rows[0].id, count: rows.length, approximate:rows.some(r=>r.locationPrecision==='COUNTY_ILLUSTRATION') } })) };
    const layers = <GeoJSONSource id="source-lead-public-meeting-points" data={data} onPress={e => { const id = e.nativeEvent.features[0]?.properties?.id; if (uuid(id)) {
        const lead = items.find(r => r.id === id), same = lead ? groups.get(lead.longitude + ',' + lead.latitude) : null;
        if (same && same.length > 1) {
            setDetail(null);
            setGroupIds(same.map(r => r.id));
        }
        else
            void open(id);
    } }}>
  <Layer id="source-lead-points" type="circle" paint={{ 'circle-color': ['case',['get','approximate'],'#A36B17','#5269B0'], 'circle-radius': 16, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }}/>
  <Layer id="source-lead-point-counts" type="symbol" layout={{ 'text-field': ['to-string', ['get', 'count']], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-allow-overlap': true }} paint={{ 'text-color': '#FFFFFF' }}/>
 </GeoJSONSource>;
    const list = <View><Text>外部來源線索 {items.length} 筆 · 不是在售件數</Text><Text>公共面交點不是賣家或商品所在地；概略位置，非取貨點。庫存與交易待確認。</Text>{items.map(r => <Pressable key={r.id} accessibilityRole="button" onPress={() => void open(r.id)} style={listingPresentation.card}><ListingPhoto uri={r.media?.[0]?.thumbnailUrl} label={r.media?.[0]?.alt ?? r.title}/><View style={listingPresentation.cardText}><Text style={listingPresentation.badge}>外部來源 · 庫存待確認</Text><Text numberOfLines={2} style={listingPresentation.title}>{r.title}</Text><Text style={listingPresentation.price}>{r.publicFacts?.priceText || "售價待詢問"}</Text><ProductInterest kind="source" id={r.id} compact readOnly/><Text style={listingPresentation.small}>{r.county}{r.district} · {sourceLocationLabel(r)}</Text><Text style={listingPresentation.small}>{r.publicPlaceName}</Text></View></Pressable>)}{cursor && items.length < 500 && <Pressable disabled={busy} onPress={() => void load(cursor)}><Text>載入更多來源線索</Text></Pressable>}{items.length >= 500 && <Text>請縮小範圍再搜尋。</Text>}{!!error && <><Text accessibilityRole="alert">{error}</Text><Pressable disabled={busy} onPress={() => void load()}><Text>重新讀取來源線索</Text></Pressable></>}</View>;
    const closeDetail=()=>{detailGeneration.current++;setDetail(null);setGroupIds([]);};
    const modal = <SafeAreaModal onDismiss={()=>{const context=pendingSourceRoute.current;pendingSourceRoute.current=null;if(context&&alive.current)onOpenSourceChat(context);}} visible={!!detail || groupIds.length > 0} animationType="slide" onRequestClose={closeDetail}>
      {detail?<SourceLeadDetailContent key={detail.id} detail={detail} error={error} onBack={closeDetail}
        onAttribution={()=>{if(detail.coordinateAttribution)void Linking.openURL(detail.coordinateAttribution.url);}}
        onOriginal={async()=>{const request=detailGeneration.current;try{const fresh=parseLead(await api<unknown>('/source-leads/'+detail.id+'?approximate=1&unlocated=1'));if(fresh.id!==detail.id)throw new Error();if(!alive.current||request!==detailGeneration.current)return;await Linking.openURL(fresh.canonicalUrl);}catch{setError('來源已失效或無法開啟，請稍後重試。');}}}
        onContact={()=>{const context=sourceChatContext(detail);setDetail(null);setGroupIds([]);if(Platform.OS==='ios')pendingSourceRoute.current=context;else onOpenSourceChat(context);}}/>
       :<ScrollView contentContainerStyle={{padding:24,gap:16}}><Pressable accessibilityRole="button" style={{minHeight:48,justifyContent:'center'}} onPress={closeDetail}><Text>返回探索</Text></Pressable><Text>同一公共／概略位置的來源線索，非現貨位置</Text>{items.filter(r=>groupIds.includes(r.id)).map(r=><Pressable key={r.id} accessibilityRole="button" onPress={()=>void open(r.id)} style={listingPresentation.card}><ListingPhoto uri={r.media?.[0]?.thumbnailUrl} label={r.media?.[0]?.alt??r.title}/><View style={listingPresentation.cardText}><Text numberOfLines={2} style={listingPresentation.title}>{r.title}</Text><Text style={listingPresentation.price}>{r.publicFacts?.priceText||'售價待詢問'}</Text><Text style={listingPresentation.small}>{sourceLocationLabel(r)} · 庫存待確認</Text></View></Pressable>)}</ScrollView>}
    </SafeAreaModal>;
    return { open, layers, list, modal, count: items.filter(isLocatedLead).length, ready: !path || ready, points: items.filter(isLocatedLead).map(r => ({ longitude: r.longitude, latitude: r.latitude })) };
}
export function SourceLeadInquiry({api,apiUrl,userId,context,onBack}:{api:ReturnType<typeof createApi>;apiUrl:string;userId:number;context:SourceChatContext;onBack:()=>void}) {
 const {scope,room,recovery,ready,error,notice,question,setQuestion,busy,waiting,action}=useNativeSourceInquiry(api,apiUrl,userId,context.id);
 const [editorScope,setEditorScope]=useState('');const editing=editorScope===scope,correction=room?.state==='WAITING_ROUTE',reopening=room?.state==='CANCELLED';
 const pending=recovery.cancel??recovery.inquiry,locked=busy||waiting>0||!ready||!!pending;
 const compose=!room||room.available&&(['INQUIRY','DELIVERED'].includes(room.state)||editing&&(correction||reopening));
 const startEditing=()=>{setQuestion(room?.events.slice().reverse().find(e=>['ASK','REVISE','REOPEN'].includes(e.action))?.text??'');setEditorScope(scope);};
 const status=room?.transferIssue?t('facebookRejected'):!room?t('empty'):['DELIVERY_REQUIRES_REVIEW','CANCEL_REQUESTED'].includes(room.state)?t('review'):room.state==='CANCELLED'?t('cancelled'):!room.available?t('unavailable'):room.state==='WAITING_ROUTE'?t('waiting')+(context.contactRouting?.reason||t('route'))+' '+t('notSent'):room.state==='DELIVERED'&&room.delivered?t('deliveredNotice'):t('compose');
 const replyRead=useSourceReplyRead(api,room?.id??null,room?.events.filter(e=>e.action==='SELLER_REPLY').length??0,()=>DeviceEventEmitter.emit('wishlist:chat-read'));
 const button=(label:string,run:()=>void,disabled=locked,secondary=false)=><Pressable accessibilityRole="button" disabled={disabled} onPress={run} style={[chatPresentation.button,secondary&&{backgroundColor:iosColors.surface,borderWidth:1,borderColor:iosColors.separator},disabled&&{opacity:.5}]}><Text style={[chatPresentation.buttonText,secondary&&{color:iosColors.tint}]}>{label}</Text></Pressable>;
 return <KeyboardAvoidingView style={chatPresentation.screen} behavior={Platform.OS==='ios'?'padding':undefined}>
 <View style={chatPresentation.header}><Pressable accessibilityRole="button" accessibilityLabel="返回商品" style={{minHeight:48,minWidth:72,justifyContent:'center'}} onPress={onBack}><Text>{t('back')}</Text></Pressable><Text accessibilityRole="header" numberOfLines={1} style={[chatPresentation.heading,{flex:1,textAlign:'center',marginHorizontal:12}]}>{t('title')}</Text><Pressable accessibilityRole="button" accessibilityLabel="更新線索詢問" style={{minHeight:48,minWidth:48,justifyContent:'center'}} disabled={busy||waiting>0} onPress={()=>void action('READ')}><Text>{t('update')}</Text></Pressable></View>
 <View style={chatPresentation.context}><ListingPhoto uri={context.thumbnailUrl} label={context.title}/><View style={{flex:1}}><Text style={listingPresentation.title}>{context.title}</Text><Text style={listingPresentation.price}>{context.priceText}</Text><Text style={listingPresentation.small}>{context.county}{context.district} · {t('external')}</Text><Pressable accessibilityRole="link" style={{minHeight:48,justifyContent:'center'}} onPress={()=>void Linking.openURL(context.canonicalUrl)}><Text>{t('original')}</Text></Pressable></View></View>
 <ScrollView style={chatPresentation.body} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:20,gap:12}}>
 <ChatMessageBubble mine={false} label="Wishlist AI · 流程提示" text={t('intro')}/><ChatMessageBubble mine={false} label="下一步" text={status}/>
 {context.locationPrecision==='CONTACT_FOR_LOCATION'&&<Text style={chatPresentation.meta}>{t('contactLocation')}</Text>}
 {room?.transferIssue&&<View style={{padding:16,backgroundColor:'#fff4d6',borderRadius:12}}><Text>{t('selfAskNotice')}</Text><Pressable accessibilityRole="link" style={{minHeight:48,justifyContent:'center'}} onPress={()=>void Linking.openURL(room.transferIssue!.originalPostUrl)}><Text>{t('selfAskOriginal')}</Text></Pressable></View>}
 {room&&<><NativeDisclosure title="對話資訊"><Text style={chatPresentation.meta}>{t('receipt')}{room.id} · {room.state==='DELIVERED'&&room.delivered?t('delivered'):room.delivered?t('evidence'):t('notSent')}</Text></NativeDisclosure>{room.events.map(e=><ChatMessageBubble key={e.requestId} mine={e.action!=='SELLER_REPLY'} label={e.action==='SELLER_REPLY'?t('seller'):e.action==='REVISE'?t('revisedEvent'):e.action==='REOPEN'?t('reopenedEvent'):'你'} time={e.at} text={e.text??(e.action==='CONSENT'?t('consentEvent'):t('cancelEvent'))}/>)}</>}
 <NativeInquiryAllowance api={api} revision={room?.events.length??0}/>
 {pending&&<View accessibilityRole="summary" style={{padding:16,backgroundColor:'#fff4d6',borderRadius:12}}><Text>{t(pending.operation.version===0?'legacy':'pending')}</Text><NativeDisclosure title={t('savedQuestion')}><Text>{recovery.inquiry?.operation.version===1?recovery.inquiry.operation.payload.text:recovery.inquiry?.operation.legacyPayload?.text}</Text>{pending.operation.version===1&&button(t('retry'),()=>void action('RETRY'),busy||waiting>0||!ready)}</NativeDisclosure></View>}
 {!!error&&<Text accessibilityRole="alert">{error}</Text>}{!!notice&&<Text>{notice}</Text>}{waiting>0&&<Text>{t('wait',{seconds:waiting})}</Text>}
 {pending||!ready?button(t(ready?'read':'restore'),()=>void action('READ'),busy||waiting>0):null}
 {replyRead.canMark&&button('將已載入的原賣家回覆標記已讀'+(replyRead.unread!==null?'（'+replyRead.unread+'則未讀）':''),()=>void replyRead.mark(),replyRead.busy)}{replyRead.issue&&<Text style={chatPresentation.meta}>回覆已讀狀態尚未確認，不會假稱已讀。</Text>}
 {room?.available&&(correction||reopening)&&!editing&&button(t(reopening?'reopen':'revise'),startEditing)}
 {room?.state==='CANCEL_REQUESTED'&&<Text>{t('withdrawalPending')}</Text>}
 {compose&&!pending&&<View style={{padding:16,gap:12,backgroundColor:'white',borderRadius:16}}>{editing&&(correction||reopening)&&<Text>{t(reopening?'reopenDraft':'revisionDraft')}</Text>}{button(t('purchase'),()=>setQuestion(t('purchaseDraft')),locked,true)}<TextInput placeholderTextColor={iosColors.secondaryLabel} accessibilityLabel="Wishlist AI 商品問題" placeholder="想確認什麼？問題送出前可修改" maxLength={1500} value={question} onChangeText={setQuestion} editable={!locked} multiline style={chatPresentation.input}/><Text style={chatPresentation.meta}>{t('consent')}</Text>{button(t(reopening?'sendReopen':correction?'sendRevision':'send'),()=>void action(reopening?'REOPEN':correction?'REVISE':'ASK').then(ok=>{if(ok)setEditorScope('');}),locked||!question.trim())}{editing&&(correction||reopening)&&button(t('cancelEdit'),()=>setEditorScope(''),busy)}</View>}
 {room?.available&&room.state==='INQUIRY'&&room.events.some(e=>e.action==='ASK')&&button(t('consentButton'),()=>void action('CONSENT'))}
 {room&&['INQUIRY','WAITING_ROUTE','TRANSFER_RESERVED'].includes(room.state)&&button(t('cancel'),()=>void action('CANCEL'),busy||waiting>0||!ready,true)}
 </ScrollView></KeyboardAvoidingView>;
}
