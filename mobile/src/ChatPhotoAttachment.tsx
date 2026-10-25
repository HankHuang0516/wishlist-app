import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { createApi } from './api';
import {jpegChatPhotoUploadForm} from './photoUploadForm';
import { pendingRequestKey, privatePendingStore } from './nativePendingStore';
import { photoMessageReceipt, photoMessageRequest, type PhotoMessageRequest } from './chatPhoto';
import type { ChatMessage, ChatRoomRecord } from './chatData';
import { SafeAreaModal } from './SafeAreaModal';
import { iosColors, iosRadius, iosSpacing, iosType } from './iosTheme';
import { privateChatPhotoDataUri } from './privateListingThumbnail';
async function digest(uri:string) { return [...new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,await new File(uri).arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join(''); }
type Props={room:ChatRoomRecord;api:ReturnType<typeof createApi>;apiUrl:string;userId:number;disabled:boolean;onPendingChange:(value:boolean)=>void;onSent:(message:ChatMessage)=>void};
export function ChatPhotoAttachment({room,api,apiUrl,userId,disabled,onPendingChange,onSent}:Props) {
 const [uri,setUri]=useState(''),[caption,setCaption]=useState(''),[open,setOpen]=useState(false),[pending,setPending]=useState<PhotoMessageRequest|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=useRef(''),alive=useRef(false),mutating=useRef(false),generation=useRef(0);
 useEffect(()=>{alive.current=true;const g=++generation.current;onPendingChange(true);void(async()=>{try{const k=await pendingRequestKey(apiUrl,userId,'message-photo.'+room.id),saved=await privatePendingStore.get(k),p=saved?photoMessageRequest(JSON.parse(saved)):null;if(alive.current&&g===generation.current){key.current=k;setPending(p);setCaption(p?.text==='[商品照片]'?'':p?.text??'');setOpen(!!p);setReady(true);onPendingChange(!!p);}}catch{if(alive.current&&g===generation.current)setError('無法恢復照片傳送記錄，請重新開啟聊天。');}})();return()=>{alive.current=false;generation.current++;};},[room.id,userId,apiUrl,onPendingChange]);
 async function choose(camera:boolean){if(mutating.current||(!pending&&disabled))return;mutating.current=true;setBusy(true);setError('');try{
 if(camera&&!(await ImagePicker.requestCameraPermissionsAsync()).granted)throw Error('未授予相機權限；也可以從相簿選擇照片。');
 const result=camera?await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:1,exif:false}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:false,quality:1,exif:false});
 if(result.canceled)return;const asset=result.assets[0],context=ImageManipulator.manipulate(asset.uri);let rendered;
 try{if(Math.max(asset.width,asset.height)>1600)context.resize(asset.width>=asset.height?{width:1600}:{height:1600});rendered=await context.renderAsync();const photo=await rendered.saveAsync({format:SaveFormat.JPEG,compress:0.85,base64:false});
 if(new File(photo.uri).size>5242880)throw Error('壓縮後照片仍超過5MB。');if(pending&&await digest(photo.uri)!==pending.photoHash)throw Error('請選擇原照片；原傳送結果尚未確認。');if(alive.current){setUri(photo.uri);setOpen(true);}
 }finally{rendered?.release();context.release();}
 }catch(e){if(alive.current)setError(e instanceof Error?e.message:'無法取得照片。');}finally{mutating.current=false;if(alive.current)setBusy(false);}}
 async function act(lookup:boolean,abandon=false){if(!ready||mutating.current||(!pending&&(disabled||room.blocked||room.archived))||(!lookup&&!abandon&&!uri))return;mutating.current=true;setBusy(true);setError('');try{
 const request=pending??photoMessageRequest({clientMessageId:Crypto.randomUUID(),text:caption.trim()||'[商品照片]',photoHash:await digest(uri)}),body=JSON.stringify(request);
 if(!pending){await privatePendingStore.save(key.current,body);if(!alive.current)return;setPending(request);onPendingChange(true);}
 let value:unknown;
 if(abandon){
   const result=await api(`/chat/conversations/${room.id}/photo-messages/abandon`,{method:'POST',body}) as {state?:string;clientMessageId?:string;photoHash?:string;message?:unknown};
   if(result.state==='ABANDONED'&&result.clientMessageId===request.clientMessageId&&result.photoHash===request.photoHash){
     const cleared=await privatePendingStore.clear(key.current,body);if(!cleared&&await privatePendingStore.get(key.current)!==null)throw Error();
     if(alive.current){setPending(null);setUri('');setCaption('');setOpen(false);onPendingChange(false);}return;
   }
   if(result.state!=='SENT')throw Error();value=result.message;
 }
 else
 if(lookup)value=await api(`/chat/conversations/${room.id}/messages/by-client-id/${request.clientMessageId}`);
 else{if(room.blocked||room.archived)throw Error();if(await digest(uri)!==request.photoHash)throw Error();const data=jpegChatPhotoUploadForm(request,uri);value=await api(`/chat/conversations/${room.id}/photo-messages`,{method:'POST',body:data,timeoutMs:60000});}
 const message=photoMessageReceipt(value,room,userId,request);const cleared=await privatePendingStore.clear(key.current,body);if(!cleared&&await privatePendingStore.get(key.current)!==null)throw Error();
 if(alive.current){setPending(null);setUri('');setCaption('');setOpen(false);onPendingChange(false);onSent(message);}
 }catch{if(alive.current)setError('尚未確認照片送出。請先查核原回執；不會自動重送。');}finally{mutating.current=false;if(alive.current)setBusy(false);}}
 return <View>{!open&&<Pressable accessibilityRole="button" disabled={!ready||busy||(!pending&&disabled)} style={s.action} onPress={()=>setOpen(true)}><Text style={s.link}>{pending?'照片結果待確認':'補傳商品照片'}</Text></Pressable>}{!!error&&!open&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
 <SafeAreaModal visible={open} animationType="slide" onRequestClose={()=>{if(!busy)setOpen(false);}} contentStyle={s.screen}><View style={s.header}><Text style={s.title}>傳送商品照片</Text><Pressable accessibilityRole="button" style={s.action} disabled={busy} onPress={()=>setOpen(false)}><Text style={s.link}>返回聊天</Text></Pressable></View>
 <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">{!!uri&&<Image source={{uri}} style={s.preview} resizeMode="contain" accessibilityLabel="待傳送商品照片預覽"/>}
 <View style={s.row}><Pressable accessibilityRole="button" disabled={busy||(!pending&&disabled)} style={s.action} onPress={()=>void choose(false)}><Text style={s.link}>{pending?'重新選取原照片':'從相簿選擇'}</Text></Pressable><Pressable accessibilityRole="button" disabled={busy||(!pending&&disabled)} style={s.action} onPress={()=>void choose(true)}><Text style={s.link}>拍攝照片</Text></Pressable>{!!uri&&!pending&&<Pressable accessibilityRole="button" disabled={busy} style={s.action} onPress={()=>setUri('')}><Text style={s.link}>移除照片</Text></Pressable>}</View>
 <Text style={s.text}>每次1張・壓縮後最多5MB・移除定位資訊。照片不會公開展示。</Text><Text style={s.text}>補充說明（選填）</Text><TextInput placeholderTextColor={iosColors.secondaryLabel} accessibilityLabel="照片補充說明" placeholder="例如：機身背面，螢幕無裂痕" style={s.input} value={caption} onChangeText={setCaption} editable={!busy&&!pending} maxLength={2000} multiline/>
 <Text style={s.text}>請勿傳送證件、付款資料或住家地址。一般檢視限對話成員，檢舉與管理查核依隱私政策處理。</Text>{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{busy&&<ActivityIndicator/>}
 {pending&&<><Pressable accessibilityRole="button" style={s.action} disabled={busy} onPress={()=>void act(true)}><Text style={s.link}>確認照片傳送結果</Text></Pressable><Text style={s.text}>停止只會阻止尚未完成的傳送，無法收回已送出的照片。</Text><Pressable accessibilityRole="button" style={s.action} disabled={busy} onPress={()=>void act(false,true)}><Text style={s.link}>停止尚未完成的原傳送</Text></Pressable></>}
 <Pressable accessibilityRole="button" style={[s.primary,(busy||!uri||room.blocked||room.archived)&&s.disabled]} disabled={busy||!uri||room.blocked||room.archived||(!pending&&disabled)} onPress={()=>void act(false)}><Text style={s.white}>{pending?'重試相同照片':'傳送照片'}</Text></Pressable></ScrollView></SafeAreaModal></View>;
}
export function ChatMessagePhoto({message,apiUrl,token,mine=false}:{message:ChatMessage;apiUrl:string;token:string;mine?:boolean}) {
 const [uri,setUri]=useState(''),[error,setError]=useState(false),[open,setOpen]=useState(false);
 const ratio=(message.photoWidth??1)/(message.photoHeight??1),height=Math.min(260,Math.max(80,250/ratio)),width=Math.min(250,height*ratio);
 useEffect(()=>{let active=true;const abort=new AbortController();setUri('');setError(false);void privateChatPhotoDataUri(message.conversationId,message.id,apiUrl,token,abort.signal,__DEV__).then(value=>{if(active)setUri(value);}).catch(()=>{if(active)setError(true);});return()=>{active=false;abort.abort();};},[message.id,message.conversationId,apiUrl,token]);
 return <View style={[s.photoWrap,mine&&s.photoMine]}>{uri?<Pressable accessibilityRole="button" accessibilityLabel="放大商品照片" style={{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'}} onPress={()=>setOpen(true)}><Image source={{uri}} accessibilityLabel="聊天商品照片" style={[s.photo,{width,height}]} resizeMode="contain"/></Pressable>:<Text style={[s.text,mine&&s.photoCaptionMine]}>{error?'照片暫時無法讀取':'照片載入中…'}</Text>}{message.text!=='[商品照片]'&&<Text style={[s.photoCaption,mine&&s.photoCaptionMine]}>{message.text}</Text>}<Text style={[s.photoTime,mine&&s.photoTimeMine]}>{new Date(message.createdAt).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'})}</Text>
 <SafeAreaModal visible={open} onRequestClose={()=>setOpen(false)} contentStyle={s.screen}><Pressable accessibilityRole="button" style={s.action} onPress={()=>setOpen(false)}><Text style={s.link}>關閉商品照片</Text></Pressable><Image source={{uri}} style={s.full} resizeMode="contain" accessibilityLabel="商品照片放大檢視"/></SafeAreaModal></View>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:iosColors.background},header:{padding:16,flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between'},title:{...iosType.title2,color:iosColors.label},body:{padding:16,gap:16},row:{flexDirection:'row',flexWrap:'wrap',gap:8},text:{...iosType.subheadline,color:iosColors.secondaryLabel},action:{minHeight:44,padding:12,justifyContent:'center'},link:{...iosType.body,color:iosColors.tint},input:{minHeight:100,borderRadius:iosRadius.card,padding:16,backgroundColor:iosColors.surface,color:iosColors.label,...iosType.body},preview:{height:260,width:'100%',borderRadius:iosRadius.card},primary:{minHeight:48,borderRadius:iosRadius.control,padding:12,backgroundColor:iosColors.tint,alignItems:'center',justifyContent:'center'},white:{...iosType.headline,color:iosColors.white},disabled:{opacity:0.45},error:{...iosType.subheadline,color:iosColors.danger},photoWrap:{margin:iosSpacing.sm,padding:8,borderRadius:iosRadius.card,maxWidth:'88%',alignSelf:'flex-start',backgroundColor:iosColors.surfaceSecondary},photoMine:{alignSelf:'flex-end',backgroundColor:iosColors.tint},photoCaption:{...iosType.body,color:iosColors.label,paddingTop:8},photoCaptionMine:{color:iosColors.white},photoTime:{...iosType.caption,color:iosColors.secondaryLabel,paddingTop:6,alignSelf:'flex-end'},photoTimeMine:{color:iosColors.white},photo:{width:250,maxWidth:'100%',height:210,borderRadius:iosRadius.card},full:{flex:1,width:'100%'}});
