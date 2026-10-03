import { ChatMessageBubble, chatPresentation } from './ChatPresentation';
import { ListingPhoto, photoStyles, listingPresentation } from './ListingPhoto';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, Linking, AppState } from 'react-native';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import * as Crypto from 'expo-crypto';
import type { FeatureCollection, Point } from 'geojson';
import { createApi, ApiError } from './api';
import type { Bounds } from './listingSearch';
import { uuid } from './listingForm';
import { pendingRequestKey, privatePendingStore } from './nativePendingStore';
import { sourceLocationLabel, parseLeadPage, parseLead, parseLeadRoom, type SourceLead, type LeadRoom, type ContactRouting } from './sourceLeadData';
export type SourceChatContext = {id:string;title:string;canonicalUrl:string;county:string;district:string;priceText:string;thumbnailUrl?:string;contactRouting?:ContactRouting};
export const sourceChatContext=(r:SourceLead):SourceChatContext=>({id:r.id,title:r.title,canonicalUrl:r.canonicalUrl,county:r.county,district:r.district,priceText:r.publicFacts?.priceText||"售價待詢問",thumbnailUrl:r.media?.[0]?.thumbnailUrl,contactRouting:r.contactRouting});
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
    const [items, setItems] = useState<SourceLead[]>([]), [cursor, setCursor] = useState<string | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [detail, setDetail] = useState<SourceLead | null>(null), [asking, setAsking] = useState(false), [groupIds, setGroupIds] = useState<string[]>([]);
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
    async function open(id: string) { const seq = ++detailGeneration.current; setAsking(false); setGroupIds([]); try {
        const r = parseLead(await api<unknown>('/source-leads/' + id + '?presentation=1&approximate=1'));
        if (r.id !== id)
            throw new Error();
        if (alive.current && seq === detailGeneration.current)
            setDetail(r);
    }
    catch {
        if (alive.current && seq === detailGeneration.current) {
            setDetail(null);
            setError('線索已撤回或超過日期範圍，請重新搜尋。');
        }
    } }
    useEffect(()=>{if(initialSourceId&&uuid(initialSourceId))void open(initialSourceId).finally(()=>onInitialSourceHandled?.());},[initialSourceId,api]);
    const groups = new Map<string, SourceLead[]>();
    for (const r of items) {
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
    const list = <View><Text>外部來源線索 {items.length} 筆 · 不是在售件數</Text><Text>公共面交點不是賣家或商品所在地；概略位置，非取貨點。庫存與交易待確認。</Text>{items.map(r => <Pressable key={r.id} accessibilityRole="button" onPress={() => void open(r.id)} style={listingPresentation.card}><ListingPhoto uri={r.media?.[0]?.thumbnailUrl} label={r.media?.[0]?.alt ?? r.title}/><View style={listingPresentation.cardText}><Text style={listingPresentation.badge}>外部來源 · 庫存待確認</Text><Text numberOfLines={2} style={listingPresentation.title}>{r.title}</Text><Text style={listingPresentation.price}>{r.publicFacts?.priceText || "售價待詢問"}</Text><Text style={listingPresentation.small}>{r.county}{r.district} · {sourceLocationLabel(r)}</Text><Text style={listingPresentation.small}>{r.publicPlaceName}</Text></View></Pressable>)}{cursor && items.length < 500 && <Pressable disabled={busy} onPress={() => void load(cursor)}><Text>載入更多來源線索</Text></Pressable>}{items.length >= 500 && <Text>請縮小範圍再搜尋。</Text>}{!!error && <><Text accessibilityRole="alert">{error}</Text><Pressable disabled={busy} onPress={() => void load()}><Text>重新讀取來源線索</Text></Pressable></>}</View>;
    const modal = <Modal visible={!!detail || groupIds.length > 0} animationType="slide" onRequestClose={() => { detailGeneration.current++; setDetail(null); setGroupIds([]); }}><ScrollView contentContainerStyle={{ padding: 24, paddingTop: 60, gap: 16 }}><Pressable accessibilityRole="button" onPress={() => { detailGeneration.current++; setDetail(null); setGroupIds([]); }}><Text>返回探索</Text></Pressable>{groupIds.length > 0 && <View><Text>同一公共／概略位置的來源線索，非現貨位置</Text>{items.filter(r => groupIds.includes(r.id)).map(r => <Pressable key={r.id} onPress={() => void open(r.id)} style={{ padding: 14 }}><View style={listingPresentation.card}><ListingPhoto uri={r.media?.[0]?.thumbnailUrl} label={r.media?.[0]?.alt??r.title}/><View style={listingPresentation.cardText}><Text numberOfLines={2} style={listingPresentation.title}>{r.title}</Text><Text style={listingPresentation.price}>{r.publicFacts?.priceText||"售價待詢問"}</Text><Text style={listingPresentation.small}>{sourceLocationLabel(r)} · 庫存待確認</Text></View></View></Pressable>)}</View>}{detail && (asking ? <Text>請從 Wishlist AI 聊聊繼續</Text> : <><ScrollView horizontal>{detail.media?.length ? detail.media.map(m => <ListingPhoto key={m.id} uri={m.imageUrl} label={m.alt} detail style={photoStyles.detail}/>) : <ListingPhoto label={detail.title} detail style={photoStyles.detail}/>}</ScrollView><Text style={listingPresentation.badge}>外部來源線索 · 庫存與交易待確認</Text><Text accessibilityRole="header" style={listingPresentation.title}>{detail.title}</Text><Text style={listingPresentation.price}>{detail.publicFacts?.priceText || "售價待詢問"}</Text><Text style={listingPresentation.small}>{detail.county}{detail.district} · {sourceLocationLabel(detail)}，非現貨所在地</Text><Text style={listingPresentation.title}>商品說明</Text><Text>{detail.summary}</Text>{detail.publicFacts && <><Text>計價單位：{detail.publicFacts.priceUnitStatus === 'unknown' ? '原帖未明示，待詢問' : '依原帖標示，仍需確認交付數量'}。{detail.publicFacts.currencyStatus.includes('infer') ? '幣別為情境推定，待原賣家確認。' : '幣別依原帖證據標示。'}</Text><Text>{detail.publicFacts.sourceAccessNotice}</Text><Text>{detail.publicFacts.originalDateLabel}</Text><Text>{detail.publicFacts.locationRelation}</Text>{detail.publicFacts.coordinateQualityNotes.map((note, i) => <Text key={i}>{note}</Text>)}</>}{detail.coordinateAttribution && <Pressable onPress={() => void Linking.openURL(detail.coordinateAttribution!.url)}><Text>{detail.coordinateAttribution.text} · ODbL</Text></Pressable>}<Text>{sourceLocationLabel(detail)}：{detail.publicPlaceName}／{detail.publicAddress}</Text><Text>{detail.notice}</Text><Text>{detail.contactRouting?.reason||'原賣家收訊路由待核實；原帖不能代替私訊收件人。'}</Text><Text>原始發布日期區間：{new Date(detail.postedEarliestAt).toLocaleDateString('zh-TW')}～{new Date(detail.postedLatestAt).toLocaleDateString('zh-TW')}</Text><Text>來源最後查核：{new Date(detail.checkedAt).toLocaleString('zh-TW')}</Text><Pressable accessibilityRole="button" onPress={() => void api<unknown>('/source-leads/' + detail.id+'?approximate=1').then(parseLead).then(r => Linking.openURL(r.canonicalUrl)).catch(() => setError('來源已失效，未開啟。'))}><Text>前往原始來源</Text></Pressable><Pressable accessibilityRole="button" onPress={() => {onOpenSourceChat(sourceChatContext(detail));setDetail(null);}}><Text>聯絡賣家（Wishlist AI 代轉）</Text></Pressable><Text>不顯示未授權圖片，不提供下訂或付款。</Text>{!!error && <Text accessibilityRole="alert">{error}</Text>}</>)}</ScrollView></Modal>;
    return { layers, list, modal, count: items.length, ready: !path || ready, points: items.map(r => ({ longitude: r.longitude, latitude: r.latitude })) };
}
export function SourceLeadInquiry({ api, apiUrl, userId, context, onBack }: {
    api: ReturnType<typeof createApi>;
    apiUrl: string;
    userId: number;
    context: SourceChatContext;
    onBack: () => void;
}) {
    const leadId=context.id;
    const [room, setRoom] = useState<LeadRoom | null>(null), [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const alive = useRef(true), inflight = useRef(false), key = useRef<string | null>(null), pending = useRef<{
        requestId: string;
        action: string;
        text?: string;
        consent?: boolean;
        transferHash?: string;
    } | null>(null);
    async function load() { if (inflight.current)
        return; inflight.current = true; setBusy(true); try {
        key.current = await pendingRequestKey(apiUrl, userId, 'source-lead.' + leadId);
        const saved = await privatePendingStore.get(key.current);
        if (saved) {
            const b = JSON.parse(saved);
            if (!uuid(b.requestId) || !['ASK', 'CONSENT', 'CANCEL'].includes(b.action))
                throw new Error();
            pending.current = b;
        }
        const raw = await api<unknown>('/source-leads/' + leadId + '/inquiry?presentation=1');
        if(raw === null){if(alive.current){setRoom(null);setError(pending.current?'原請求結果未確認，僅能重試同一筆。':'');}return;}
        const r = parseLeadRoom(raw, leadId);
        if (saved && r.events.some(e => e.requestId === pending.current?.requestId && e.action === pending.current?.action && e.text === pending.current?.text)) {
            await privatePendingStore.clear(key.current, saved);
            pending.current = null;
        }
        if (alive.current) {
            setRoom(r);
            setError(pending.current ? '原請求結果未確認，僅能重試同一筆。' : '');
        }
    }
    catch {
        if (alive.current)
            setError('無法開啟線索詢問。');
    }
    finally {
        inflight.current = false;
        if (alive.current)
            setBusy(false);
    } }
    useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, [api, leadId]);
    async function act(action: string) {
      if ((!room&&action!=='ASK')||!key.current||inflight.current)return;
      inflight.current=true;setBusy(true);let body=pending.current;
      try {
        const active=room??parseLeadRoom(await api<unknown>('/source-leads/'+leadId+'/inquiry?presentation=1',{method:'POST',body:'{}'}),leadId);
        if(alive.current)setRoom(active);
        if(!body&&!room&&active.events.some(e=>e.action==='ASK')) throw new Error('另一裝置已有問題，請先更新閱讀後再同意代問。');
        body=body??{requestId:Crypto.randomUUID(),action,...(action==='ASK'?{text:text.trim(),consent:true,transferHash:active.transferHash}:{}),...(action==='CONSENT'?{consent:true,transferHash:active.transferHash}:{})};
        await privatePendingStore.save(key.current,JSON.stringify(body));pending.current=body;
        const result=parseLeadRoom(await api<unknown>('/source-leads/'+leadId+'/inquiry/'+active.id+'/actions?presentation=1',{method:'POST',body:JSON.stringify(body)}),leadId);
        await privatePendingStore.clear(key.current,JSON.stringify(body));pending.current=null;
        if(alive.current){setRoom(result);setText('');setError('');}
      } catch(e) {
        if(body&&e instanceof ApiError&&[400,401,403,404,409,429].includes(e.status)){
          try{await privatePendingStore.clear(key.current,JSON.stringify(body));pending.current=null;}catch{if(alive.current)setError('無法清除已拒絕紀錄，請更新核對。');return;}
          if(alive.current)setError('未接受新操作，尚未送給原賣家；請更新閱讀問題與來源後重新確認。');
        }else if(alive.current)setError(pending.current?'结果尚未確認，保留同一識別碼；請更新或重試同一筆，不建立替代訊息。':e instanceof Error?e.message:'目前無法讀取，未送出問題。');
      }finally{inflight.current=false;if(alive.current)setBusy(false);}
    }
    const button = (label: string, action: string, disabled = false) => <Pressable accessibilityRole="button" disabled={busy || !!pending.current || disabled} onPress={() => void act(action)} style={chatPresentation.button}><Text style={chatPresentation.buttonText}>{label}</Text></Pressable>;
    const editable=!busy&&!pending.current&&(!room||room.available&&room.state==='INQUIRY');
    const status=!room?'輸入商品問題或購買意願，送出即接至 Wishlist AI 收件；未核實原賣家路由前不外送。':['DELIVERY_REQUIRES_REVIEW','CANCEL_REQUESTED'].includes(room.state)?'回執需人工核對或正在撤回，停止後續轉交，不會重送。':room.state==='CANCELLED'?'購買意願與後續代問已取消。':!room.available?'來源商品已失效或變更，後續代問已停止；保留原詢問供核查。':room.state==='INQUIRY'?'請閱讀先前问题或輸入新問題，送出即同意代問。':room.state==='WAITING_ROUTE'?'已接至 Wishlist AI 收件；'+(context.contactRouting?.reason||'原賣家收訊路由待核實。')+' 尚未送給賣家。':room.state==='DELIVERED'&&room.delivered?'已記錄人工代轉回執，等待原賣家答覆；尚未成立訂單。':'人工代問處理中，尚未確認送達。';
    return <View style={chatPresentation.screen}><View style={chatPresentation.header}><Pressable accessibilityRole="button" onPress={onBack}><Text>返回商品</Text></Pressable><Text style={chatPresentation.heading}>Wishlist AI 聊聊</Text><Pressable accessibilityRole="button" disabled={busy} onPress={()=>void load()}><Text>更新</Text></Pressable></View>
    <View style={chatPresentation.context}><ListingPhoto uri={context.thumbnailUrl} label={context.title}/><View style={{flex:1}}><Text style={listingPresentation.title}>{context.title}</Text><Text style={listingPresentation.price}>{context.priceText}</Text><Text style={listingPresentation.small}>{context.county}{context.district} · 外部來源</Text><Text style={chatPresentation.meta}>商品ID：{context.id}</Text><Pressable onPress={()=>void Linking.openURL(context.canonicalUrl)}><Text>查看原始來源</Text></Pressable></View></View>
    <ScrollView style={chatPresentation.body}><ChatMessageBubble mine={false} label="Wishlist AI · 流程提示" text={'我協助代問，並不是原賣家。現貨、價格、圖文權利及交易條件仍待確認；提出購買意願不會下訂或付款。'}/><ChatMessageBubble mine={false} label="下一步" text={status}/>{room&&<><Text style={chatPresentation.meta}>收件編號：{room.id} · {room.state} · {room.state==='DELIVERED'&&room.delivered?'已人工轉交':room.delivered?'已保存外送回執，後續待核查':'未送給賣家'}</Text>{room.events.map(e=><ChatMessageBubble key={e.requestId} mine={e.action!=="SELLER_REPLY"} label={e.action==="SELLER_REPLY"?"原賣家回覆 · Wishlist AI 代轉":"你"} time={e.at} text={e.text??(e.action==='CONSENT'?'同意只代問上述問題':'取消後續代問')}/>)}</>}{!!error&&<Text accessibilityRole="alert">{error}</Text>}</ScrollView>
    <View style={chatPresentation.composer}>{editable&&<><Pressable accessibilityRole="button" onPress={()=>{setText('我有購買意願。請先向原賣家確認是否仍在售、單件價格與數量、實際商品所在地、取貨方式及最新交易條件。');}}><Text>我想購買，先代問現貨與交易條件</Text></Pressable><TextInput accessibilityLabel="Wishlist AI 商品問題" placeholder="想確認什麼？問題送出前可修改" maxLength={1500} value={text} onChangeText={v=>{setText(v);}} editable={editable} multiline style={chatPresentation.input}/><Text style={chatPresentation.meta}>按送出即同意由 Wishlist AI 按此商品來源代轉本對話問題給核實的原賣家，不附加帳號聯絡資料；不下訂或付款。</Text>{button('送出並委託聯絡賣家','ASK',!text.trim())}</>}
    {room?.available&&room.state==='INQUIRY'&&room.events.some(e=>e.action==='ASK')&&<><Text>僅轉交上列問題及來源連結，不附加帳號聯絡資料；請勿加入不願分享的個資。</Text>{button('同意代問上列問題','CONSENT')}</>}
    {room&&!['CANCELLED','DELIVERED','CANCEL_REQUESTED','DELIVERY_REQUIRES_REVIEW'].includes(room.state)&&button('取消購買意願及後續代問','CANCEL')}
    {pending.current&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void act(pending.current!.action)}><Text>重試同一筆收件，不重複送出</Text></Pressable>}{!room&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void load()}><Text>重試讀取</Text></Pressable>}</View></View>;
}
