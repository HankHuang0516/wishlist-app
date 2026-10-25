import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useIAP, type Purchase } from 'expo-iap';
import Constants from 'expo-constants';
import {validateApiUrl} from './api';
import { SafeAreaModal } from './SafeAreaModal';
import { parseBillingBenefits, type BillingBenefits } from './billingBenefits';
type BillingApi = <T>(path:string, options?:RequestInit)=>Promise<T>;
const ids=['wishlist_sponsor_90','wishlist_premium_monthly','wishlist_marketing_10'];
const names=['贊助 Wishlist · NT$90','尊榮版 · NT$90／月','行銷小助手 · US$1／10 次'];
const descriptions=['單次支持服務營運，不包含尊榮或行銷額度。','尊榮版代問權益、每月 100 次行銷額度。按月自動續訂，可隨時於原商店取消。','10 次行銷額度不限期，非訂閱。'];
const control={minHeight:48,justifyContent:'center' as const,padding:12,borderRadius:12,backgroundColor:'#f0f3f7'};
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
export function NativeBilling({api}:{api:BillingApi}) {
    const [data,setData]=useState<{api:BillingApi;value:BillingBenefits;credits:number}|null>(null),[retry,setRetry]=useState(0),[open,setOpen]=useState(false);
    useEffect(()=>{let active=true;const controller=new AbortController();setOpen(false);void Promise.all([api<unknown>('/payment/benefits',{signal:controller.signal}),api<{permanentCreditsRemaining:number}>('/marketing/availability',{signal:controller.signal})]).then(([raw,allowance])=>{const value=parseBillingBenefits(raw);if(!Number.isSafeInteger(allowance?.permanentCreditsRemaining)||allowance.permanentCreditsRemaining<0)throw new Error();if(active)setData({api,value,credits:allowance.permanentCreditsRemaining});}).catch(()=>{if(active)setData(null);});return()=>{active=false;controller.abort();};},[api,retry]);
    const benefits=data?.api===api?data.value:null;
    const ready=benefits&&(Platform.OS==='ios'?benefits.availability.apple:benefits.availability.google);
    return <View style={{gap:12,padding:16,borderRadius:18,backgroundColor:'white'}}>
        <Text style={{fontSize:19,fontWeight:'600'}}>贊助與升級</Text>
        {ids.map((id,i)=><View key={id} style={{gap:5,paddingVertical:10,borderBottomWidth:0.5,borderColor:'#ddd'}}><Text style={{fontWeight:'600'}}>{names[i]}</Text><Text>{descriptions[i]}</Text></View>)}
        <Text>{benefits?benefits.inquiry.premium?'尊榮代問權益已啟用':`本週免費代問剩 ${benefits.inquiry.freeRemaining}／3 次`:'權益尚未確認'}</Text>
        <Text>免費代問每週一台灣時間 00:00 重新提供 3 次，不累積。</Text>
        <Text>永久加值剩餘：{data?.api===api?`${data.credits} 次`:'尚未確認'}</Text>
        {ready?<Pressable accessibilityRole="button" style={control} onPress={()=>setOpen(true)}><Text>查看商店價格與購買</Text></Pressable>:<Text>購買尚在準備中；既有權益與每週免費代問不受影響。</Text>}
        <Pressable accessibilityRole="button" style={control} onPress={()=>setRetry(n=>n+1)}><Text>重新核對權益</Text></Pressable>
        <Pressable accessibilityRole="link" style={control} onPress={()=>void Linking.openURL(Platform.OS==='ios'?'https://apps.apple.com/account/subscriptions':'https://play.google.com/store/account/subscriptions')}><Text>在原商店管理訂閱</Text></Pressable>
        {open&&benefits&&<SafeAreaModal visible animationType="slide" onRequestClose={()=>setOpen(false)}><StoreCheckout api={api} benefits={benefits} onClose={()=>{setOpen(false);setRetry(n=>n+1);}}/></SafeAreaModal>}
    </View>;
}
function StoreCheckout({api,benefits,onClose}:{api:BillingApi;benefits:BillingBenefits;onClose:()=>void}) {
    const [pending,setPending]=useState<Purchase|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[restoring,setRestoring]=useState(false);
    const active=useRef(true),running=useRef(false),identity=useRef(api);identity.current=api;
    useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
    const iap=useIAP({onPurchaseSuccess:purchase=>{if(active.current){setPending(purchase);void verify(purchase);}},onPurchaseError:()=>{if(active.current){setBusy(false);setMessage('商店未完成購買；請核對原交易後再操作。');}},onError:()=>{if(active.current){setBusy(false);setMessage('商店暫時無法讀取，請明確重新讀取。');}}});
    useEffect(()=>{if(iap.connected)void load();},[iap.connected]);
    useEffect(()=>{if(restoring&&iap.availablePurchases.length){setRestoring(false);const purchase=iap.availablePurchases.find(p=>ids.includes(p.productId));if(purchase){setPending(purchase);void verify(purchase);}}},[iap.availablePurchases,restoring]);
    async function load(){await iap.fetchProducts({skus:[ids[0],ids[2]],type:'in-app'});await iap.fetchProducts({skus:[ids[1]],type:'subs'});}
    async function verify(purchase:Purchase){
        if(running.current||!active.current)return;
        running.current=true;setBusy(true);const originalApi=api;
        try{
            if(purchase.purchaseState!=='purchased'||!ids.includes(purchase.productId)||!purchase.purchaseToken)throw new Error();
            const result=await originalApi<{verified:boolean;active:boolean;environment:string}>('/payment/verify',{method:'POST',body:JSON.stringify({provider:Platform.OS==='ios'?'APPLE':'GOOGLE',productId:purchase.productId,receipt:purchase.purchaseToken})});
            if(!active.current||identity.current!==originalApi)return;
            if(result.verified!==true||result.environment!==benefits.environment)throw new Error();
            // Google is consumed/acknowledged by the backend after its durable
            // ledger commit. StoreKit finishes only after server verification.
            if(Platform.OS==='ios')await iap.finishTransaction({purchase,isConsumable:purchase.productId!==ids[1]});
            if(active.current){setPending(null);setMessage(result.active?(result.environment==='Sandbox'?'測試交易已核對，沒有正式扣款。':'付款已核對，請返回重新讀取權益。'):'原交易已失效或撤銷，未開通權益。');}
        }catch{if(active.current)setMessage('付款結果尚未確認。請保留原交易並查核，不要再次購買。');}
        finally{running.current=false;if(active.current)setBusy(false);}
    }
    async function buy(id:string){
        const product=[...iap.products,...iap.subscriptions].find(p=>p.id===id);if(!product||busy||pending)return;
        setBusy(true);setMessage('');
        try{
            const subscription=id===ids[1],offer=subscription&&'subscriptionOffers'in product?product.subscriptionOffers?.find(o=>o.basePlanIdAndroid==='monthly'):undefined;
            if(subscription&&Platform.OS==='android'&&!offer?.offerTokenAndroid)throw new Error();
            await iap.requestPurchase({type:subscription?'subs':'in-app',request:{apple:{sku:id,appAccountToken:benefits.accountToken},google:{skus:[id],obfuscatedAccountId:benefits.obfuscatedAccountId,...(offer?.offerTokenAndroid?{subscriptionOffers:[{sku:id,offerToken:offer.offerTokenAndroid}]}:{})}}});
        }catch{if(active.current){setBusy(false);setMessage('未能開啟商店購買，請重新讀取。');}}
    }
    return <ScrollView contentContainerStyle={{padding:20,gap:16}}><Text style={{fontSize:24,fontWeight:'600'}}>贊助與升級</Text><Text>以下為目前商店價格，確認購買前會由商店再次顯示金額。訂閱按月自動續訂。</Text>
        {benefits.environment==='Sandbox'&&<Text>商店測試模式</Text>}
        {ids.map((id,i)=>{const product=[...iap.products,...iap.subscriptions].find(p=>p.id===id);return <View key={id} style={{gap:8}}><Text style={{fontWeight:'600'}}>{names[i]}</Text><Text>{descriptions[i]}</Text><Pressable accessibilityRole="button" disabled={!product||busy||!!pending} style={[control,{opacity:!product||busy||pending?0.5:1}]} onPress={()=>Alert.alert('確認前往商店',`${descriptions[i]}\n${product?.displayPrice??''}`,[{text:'取消'},{text:'繼續',onPress:()=>void buy(id)}])}><Text>{product?`購買 · ${product.displayPrice}`:'此商品尚未開放'}</Text></Pressable></View>;})}
        {!!message&&<Text accessibilityRole="alert">{message}</Text>}
        {pending&&<Pressable accessibilityRole="button" disabled={busy} style={control} onPress={()=>void verify(pending)}><Text>重新查核原交易</Text></Pressable>}
        <Pressable accessibilityRole="button" disabled={busy} style={control} onPress={()=>{setRestoring(true);void iap.getAvailablePurchases().catch(()=>setRestoring(false));}}><Text>恢復並查核既有購買</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} style={control} onPress={()=>void load()}><Text>重新讀取商店</Text></Pressable>
        {Platform.OS==='ios'&&<Pressable accessibilityRole="link" style={control} onPress={()=>void Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}><Text>Apple 標準使用條款</Text></Pressable>}
        {['terms','privacy'].map(path=><Pressable key={path} accessibilityRole="link" style={control} onPress={()=>{try{void Linking.openURL(validateApiUrl(String(Constants.expoConfig?.extra?.apiUrl??''))+'/'+path).catch(()=>setMessage('無法開啟政策頁，請稍後重試。'));}catch{setMessage('無法開啟政策頁，請稍後重試。');}}}><Text>{path==='terms'?'Wishlist 使用條款':'隱私政策'}</Text></Pressable>)}
        <Pressable accessibilityRole="button" disabled={busy} style={control} onPress={onClose}><Text>返回並核對權益</Text></Pressable>
    </ScrollView>;
}
