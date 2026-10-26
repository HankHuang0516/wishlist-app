import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { getAvailablePurchases, useIAP, type Purchase } from 'expo-iap';
import Constants from 'expo-constants';
import { validateApiUrl } from './api';
import { SafeAreaModal } from './SafeAreaModal';
import { parseBillingBenefits, type BillingBenefits } from './billingBenefits';
import { billingPlans, purchaseRequest, type BillingPlan } from './billingPlans';
import { BillingBalance, BillingButton, BillingDetail, BillingHeader, BillingOverview, billingStyles as s } from './BillingViews';
type BillingApi = <T>(path: string, options?: RequestInit) => Promise<T>;
const control = { minHeight: 48, justifyContent: 'center' as const, padding: 12, borderRadius: 12, backgroundColor: '#f0f3f7' };
export function NativeInquiryAllowance({api,revision=0}:{api:BillingApi;revision?:number}) {
    const [data,setData]=useState<{api:BillingApi;value:BillingBenefits}|null>(null),[retry,setRetry]=useState(0);
    useEffect(()=>{let active=true;const controller=new AbortController();void api<unknown>('/payment/benefits',{signal:controller.signal}).then(parseBillingBenefits).then(value=>{if(active)setData({api,value});}).catch(()=>{if(active)setData(null);});return()=>{active=false;controller.abort();};},[api,revision,retry]);
    const quota=data?.api===api?data.value.inquiry:null;
    return <View style={{padding:12,borderRadius:12,backgroundColor:'#f3f4f6',gap:6}}>
        <Text>{quota?quota.premium?'尊榮版代問權益已啟用':`本週免費代問剩 ${quota.freeRemaining}／3 次`:'代問額度尚未確認'}</Text>
        <Text style={{fontSize:12,color:'#555'}}>每週一台灣時間 00:00 重置，不累積。新一輪委託才計次；更正、讀取與同筆重試不重複計次。</Text>
        {!quota&&<Pressable accessibilityRole="button" style={control} onPress={()=>setRetry(n=>n+1)}><Text>重新核對額度</Text></Pressable>}
    </View>;
}
export function NativeBilling({ api }: { api: BillingApi }) {
    const [data, setData] = useState<{ api: BillingApi; value: BillingBenefits; credits: number } | null>(null);
    const [retry, setRetry] = useState(0), [open, setOpen] = useState(false), [checkoutBusy, setCheckoutBusy] = useState(false), [loading, setLoading] = useState(true);
    useEffect(() => {
        let active = true; const controller = new AbortController(); setOpen(false); setLoading(true);
        void Promise.all([api<unknown>('/payment/benefits', { signal: controller.signal }),
            api<{ permanentCreditsRemaining: number }>('/marketing/availability', { signal: controller.signal })]).then(([raw, allowance]) => {
            const value = parseBillingBenefits(raw);
            if (!Number.isSafeInteger(allowance?.permanentCreditsRemaining) || allowance.permanentCreditsRemaining < 0) throw Error();
            if (active) setData({ api, value, credits: allowance.permanentCreditsRemaining });
        }).catch(() => { if (active) setData(null); }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; controller.abort(); };
    }, [api, retry]);
    const current = data?.api === api ? data : null;
    return <View style={s.entry}>
        <Text style={s.heading}>贊助與升級</Text>
        <Text style={s.note}>尊榮訂閱、行銷加值與單次支持，依需求選擇。</Text>
        <BillingBalance benefits={current?.value ?? null} credits={current?.credits ?? null} />
        <BillingButton label={loading ? '正在核對權益…' : current ? '查看方案與購買' : '重新核對權益'}
            loading={loading} disabled={loading} onPress={() => current ? setOpen(true) : setRetry(value => value + 1)} />
        {!loading && !current && <Text accessibilityRole="alert" style={s.note}>目前無法讀取權益；請重新核對，不會因此開始購買。</Text>}
        {open && current && <SafeAreaModal visible animationType="slide" onRequestClose={() => { if (!checkoutBusy) setOpen(false); }}>
            <StoreCheckout api={api} benefits={current.value} credits={current.credits} onBusyChange={setCheckoutBusy} onClose={() => { setOpen(false); setRetry(value => value + 1); }} />
        </SafeAreaModal>}
    </View>;
}
function StoreCheckout({ api, benefits, credits, onClose, onBusyChange }: { api: BillingApi; benefits: BillingBenefits; credits: number; onClose: () => void; onBusyChange: (value: boolean) => void }) {
    const [selected, setSelected] = useState<BillingPlan | null>(null), [pending, setPending] = useState<Purchase | null>(null);
    const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [uncertain, setUncertain] = useState(false), [message, setMessage] = useState('');
    const active = useRef(true), locked = useRef(false), loadingRef = useRef(false), verifying = useRef(false), identity = useRef(api);
    const pendingRef = useRef<Purchase | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    identity.current = api;
    useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
    const available = Platform.OS === 'ios' ? benefits.availability.apple : benefits.availability.google;
    useEffect(() => { active.current = true; return () => { active.current = false; clearTimer(); }; }, []);
    function clearTimer() { if (timer.current) clearTimeout(timer.current); timer.current = null; }
    function remember(purchase: Purchase | null) { pendingRef.current = purchase; if (active.current) setPending(purchase); }
    function purchaseError(error: { code?: string }) {
        if (!active.current || verifying.current || pendingRef.current) return;
        clearTimer(); locked.current = false; setBusy(false);
        const cancelled = error.code === 'user-cancelled';
        setUncertain(!cancelled);
        setMessage(cancelled ? '已取消本次購買，未新增權益。' : '商店尚未完成購買。請先查核原交易，避免重複付款。');
    }
    const iap = useIAP({
        onPurchaseSuccess: purchase => { if (active.current) { clearTimer(); remember(purchase); void verify(purchase); } },
        onPurchaseError: purchaseError,
        onError: () => { if (active.current && !locked.current) setMessage('商店暫時無法讀取，請重新讀取商店價格。'); },
    });
    useEffect(() => { if (iap.connected && available) void load(); }, [iap.connected, available]);
    async function load() {
        if (loadingRef.current || locked.current || !available) return;
        loadingRef.current = true; setLoading(true); setMessage('');
        try { if (!iap.connected && !await iap.reconnect()) throw Error();
            await iap.fetchProducts({ skus: [billingPlans[1].id, billingPlans[2].id], type: 'in-app' });
            await iap.fetchProducts({ skus: [billingPlans[0].id], type: 'subs' });
        } catch { if (active.current) setMessage('未能取得完整商店價格，請重新讀取。'); }
        finally { loadingRef.current = false; if (active.current) setLoading(false); }
    }
    async function verify(purchase: Purchase): Promise<boolean> {
        if (verifying.current || !active.current) return false;
        verifying.current = true; locked.current = true; setBusy(true); setMessage('正在查核原交易…');
        const originalApi = api, controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            if (purchase.purchaseState !== 'purchased' || !billingPlans.some(plan => plan.id === purchase.productId) || !purchase.purchaseToken) throw Error();
            const result = await originalApi<{ verified: boolean; active: boolean; environment: string }>('/payment/verify', { method: 'POST', signal: controller.signal,
                body: JSON.stringify({ provider: Platform.OS === 'ios' ? 'APPLE' : 'GOOGLE', productId: purchase.productId, receipt: purchase.purchaseToken }) });
            if (!active.current || identity.current !== originalApi) return false;
            if (result.verified !== true || result.environment !== benefits.environment) throw Error();
            // Google acknowledgement/consumption follows the durable server ledger.
            if (Platform.OS === 'ios') await iap.finishTransaction({ purchase, isConsumable: purchase.productId !== billingPlans[0].id });
            if (!active.current) return false;
            remember(null); setUncertain(false);
            setMessage(result.active ? result.environment === 'Sandbox' ? '測試交易已核對。請返回我的，重新讀取權益。' : '付款已核對。請返回我的，重新讀取權益。' : '原交易已失效或撤銷，未開通權益。');
            return true;
        } catch {
            if (active.current) { remember(purchase); setUncertain(true); setMessage(purchase.purchaseState === 'pending'
                ? '商店正在等待付款核准。請稍後查核原交易，不要重複購買。' : '付款結果尚未確認。請保留原交易並查核，不要再次購買。'); }
            return false;
        } finally { clearTimeout(timeout); verifying.current = false; locked.current = false; if (active.current) setBusy(false); }
    }
    async function restore() {
        if (locked.current || verifying.current || !iap.connected) {
            if (!iap.connected) setMessage('商店尚未連線，請稍後再查核。');
            return;
        }
        clearTimer();
        if (pendingRef.current?.purchaseState === 'purchased') { await verify(pendingRef.current); return; }
        locked.current = true; setBusy(true); setMessage('正在查核既有購買…');
        try {
            const purchases = (await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true })).filter(p => billingPlans.some(plan => plan.id === p.productId));
            if (!active.current) return;
            if (!purchases.length) { remember(null); setUncertain(false); setMessage('商店目前沒有可恢復的購買。請確認使用原購買帳號；已消耗的加值請重新核對權益。'); }
            for (const purchase of purchases) {
                remember(purchase);
                if (!await verify(purchase)) break;
            }
        } catch { if (active.current) { setUncertain(true); setMessage('查核尚未完成。請稍後再試，不要重複購買。'); } }
        finally { locked.current = false; if (active.current) setBusy(false); }
    }
    async function buy() {
        if (!selected || !available || !iap.connected || locked.current || pendingRef.current || uncertain) return;
        const product = [...iap.products, ...iap.subscriptions].find(p => p.id === selected.id);
        if (!product) { setMessage('商店價格尚未確認，請重新讀取。'); return; }
        let request;
        try { request = purchaseRequest(product, benefits, Platform.OS); }
        catch { setMessage('此方案暫時無法購買，請重新讀取商店價格。'); return; }
        locked.current = true; setBusy(true); setMessage('正在開啟商店確認畫面…');
        timer.current = setTimeout(() => {
            if (!active.current || verifying.current || pendingRef.current) return;
            // No store callback is NOT proof of failure. Require a read, never retry payment.
            locked.current = false; setBusy(false); setUncertain(true);
            setMessage('商店尚未回覆。請先查核商店購買結果，不要再次付款。');
        }, 35000);
        try { await iap.requestPurchase(request); }
        catch (error) { purchaseError(error && typeof error === 'object' ? error : {}); }
    }
    function manage() { void Linking.openURL(Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions')
        .catch(() => setMessage('無法開啟原商店，請稍後重試。')); }
    function policy(path: string) {
        if (!['terms', 'privacy'].includes(path)) return;
        try { void Linking.openURL(validateApiUrl(String(Constants.expoConfig?.extra?.apiUrl ?? '')) + '/' + path).catch(() => setMessage('無法開啟政策頁，請稍後重試。')); }
        catch { setMessage('無法開啟政策頁，請稍後重試。'); }
    }
    return <View style={s.container}>
        <BillingHeader title={selected?.name ?? '贊助與升級'} onBack={() => { if (selected) setSelected(null); else if (!busy) onClose(); else setMessage('正在確認購買狀態，請等候回覆。'); }} />
        {benefits.environment === 'Sandbox' && <Text style={s.notice}>商店測試模式</Text>}
        {selected ? <BillingDetail plan={selected} product={[...iap.products, ...iap.subscriptions].find(product => product.id === selected.id)}
            available={available} connected={iap.connected} busy={busy} uncertain={uncertain} pending={!!pending} message={message}
            onBuy={() => void buy()} onRestore={() => void restore()} onRetry={() => void load()} onManage={manage} onPolicy={policy} />
            : <BillingOverview benefits={benefits} credits={credits} products={[...iap.products, ...iap.subscriptions]} available={available}
                loading={loading} message={message} busy={busy} onSelect={setSelected} onRestore={() => void restore()} onManage={manage}
                onReload={() => void load()} onBenefits={onClose} />}
        {Platform.OS === 'ios' && selected && <Pressable accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
            onPress={() => { void Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/').catch(() => setMessage('無法開啟 Apple 使用條款。')); }}><Text style={s.link}>Apple 標準使用條款</Text></Pressable>}
    </View>;
}
