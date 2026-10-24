import React from 'react';
import {ActivityIndicator,Linking,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {createApi} from './api';
import {useNotificationPreferences} from './useNotificationPreferences';
import type {useNativeNotifications} from './nativeNotifications';
import {NativeDisclosure} from './NativeDisclosure';
import {iosColors,iosType} from './iosTheme';
export function NotificationSettingsScreen({api,apiUrl,userId,runtime,onClose}:{api:ReturnType<typeof createApi>;apiUrl:string;userId:number;runtime:ReturnType<typeof useNativeNotifications>;onClose:()=>void}){
 const p=useNotificationPreferences(api,apiUrl,userId),rows=[['chat','新的商品聊天訊息'],['meetup','面交預約與條件變更'],['sourceReply','代問收到原賣家回覆'],['preview','允許通知顯示訊息預覽']] as const;
 const action=(label:string,run:()=>void,disabled=false)=><Pressable accessibilityRole="button" disabled={disabled} style={[s.action,disabled&&s.disabled]} onPress={run}><Text style={s.link}>{label}</Text></Pressable>;
 return <ScrollView contentContainerStyle={s.body}><View style={s.header}>{action('返回我的設定',onClose)}<Text style={s.title}>通知設定</Text></View>
 <View style={s.card}><Text style={s.title}>此裝置的系統通知</Text><Text style={s.text}>系統權限：{runtime.permission==='granted'?'已允許':runtime.permission==='denied'?'未允許':runtime.permission==='undetermined'?'尚未詢問':'尚未確認'}</Text><Text style={s.text}>{runtime.registered?'裝置已完成推播註冊；送達仍取決於系統與網路。':'此裝置推播尚未完成註冊。'}</Text>
 {action('開啟／重新連線裝置通知',()=>void runtime.enable(true),runtime.busy)}{action('前往系統通知設定',()=>void Linking.openSettings(),runtime.busy)}{action('停用此裝置推播',()=>void runtime.disable(),runtime.busy)}{runtime.busy&&<ActivityIndicator/>}
 {!!runtime.issue&&<Text accessibilityRole="alert" style={s.error}>{runtime.issue==='account'?'請以收到通知的帳號登入；不會自動切換帳號。':runtime.issue==='permission'?'系統未允許通知，仍可在App內查看訊息。':runtime.issue==='unavailable'?'通知內容已不可用或無權限；不會開啟其他人的對話。':runtime.issue==='target'?'通知內容暫時無法讀取，可重新查核。':'裝置通知註冊尚未確認，請稍後重新連線。'}</Text>}
 {action('重試開啟待確認通知',()=>void runtime.retryPending(),runtime.busy)}
 </View>
 <View style={s.card}><Text style={s.title}>交易通知分類</Text><Text style={s.small}>設定會套用到同帳號已註冊的裝置；仍需要各裝置允許系統通知。行銷郵件另行設定。</Text>
 {p.current?rows.map(([key,label])=><Pressable key={key} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{checked:p.current![key],disabled:p.locked}} disabled={p.locked} style={s.row} onPress={()=>void p.update(key,!p.current![key])}><Text style={s.grow}>{label}</Text><Text style={s.link}>{p.current![key]?'開啟':'關閉'}</Text></Pressable>):<Text style={s.text}>尚未取得後台通知偏好。</Text>}
 <Text style={s.small}>預設不顯示聊天內容。開啟預覽後，訊息可能出現在鎖定畫面及推播服務中；照片只會顯示收到照片的提示。系統仍可限制預覽。</Text>
 {!!p.issue&&<Text accessibilityRole="alert" style={s.text}>{p.issue==='confirmed'?'已確認後台目前偏好。':p.issue==='changed'?'另一份操作記錄已有變更，請重新讀取。':p.issue==='cleanup'?'後台已確認，本機恢復記錄待清理。':'通知偏好結果尚未確認；原操作保留，不會自動重送。'}</Text>}
 {!p.ready&&action('重新讀取通知偏好',p.retryRead,p.busy)}
 {p.pending&&<View><Text style={s.text}>有一筆原通知偏好待確認。</Text>{p.result?action('清理已確認記錄',()=>void p.recover('cleanup'),p.busy||!p.ready):<>{action('只查核原回執',()=>void p.recover('read'),p.busy||!p.ready)}<NativeDisclosure title="更多復原選項"><Text style={s.small}>停止只會阻止尚未完成的原操作，不會撤回已套用的偏好。</Text>{action('明確重試原偏好',()=>void p.recover('retry'),p.busy||!p.ready)}{action('停止尚未完成的原操作',()=>void p.recover('abandon'),p.busy||!p.ready)}</NativeDisclosure></>}</View>}
 </View></ScrollView>;
}
const s=StyleSheet.create({body:{padding:16,gap:16,paddingBottom:32},header:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:12},title:{...iosType.title2,color:iosColors.label},card:{padding:16,gap:12,borderRadius:16,backgroundColor:iosColors.surface},text:{...iosType.body,color:iosColors.label},small:{...iosType.subheadline,color:iosColors.secondaryLabel},action:{minHeight:44,paddingVertical:12,justifyContent:'center'},link:{...iosType.body,color:iosColors.tint},row:{minHeight:52,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:iosColors.separator,paddingVertical:12},grow:{...iosType.body,color:iosColors.label,flex:1},error:{...iosType.subheadline,color:iosColors.danger},disabled:{opacity:0.45}});
