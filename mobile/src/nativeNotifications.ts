import {useEffect,useRef,useState} from 'react';
import {AppState,DeviceEventEmitter,Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import {ApiError,createApi,validateApiUrl} from './api';
import {uuid} from './listingForm';
import {parseChatRoom} from './chatData';
import type {SourceChatContext} from './SourceLeadExplorer';
export type NotificationTarget={eventId:string;userId:number;kind:'chat';roomId:string}|{eventId:string;userId:number;kind:'source';leadId:string};
export function parseNotificationTarget(value:unknown):NotificationTarget{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid notification target');const r=value as Record<string,unknown>;
 if(!uuid(r.eventId)||!Number.isSafeInteger(r.userId)||Number(r.userId)<1||Number(r.userId)>2147483647)throw Error('Invalid notification recipient');
 if(r.kind==='chat'&&uuid(r.roomId)&&Object.keys(r).sort().join(',')==='eventId,kind,roomId,userId')return r as NotificationTarget;
 if(r.kind==='source'&&uuid(r.leadId)&&Object.keys(r).sort().join(',')==='eventId,kind,leadId,userId')return r as NotificationTarget;
 throw Error('Untrusted notification route');
}
let serialized:Promise<unknown>=Promise.resolve();
function exclusive<T>(run:()=>Promise<T>):Promise<T>{const next=serialized.then(run,run);serialized=next.catch(()=>undefined);return next;}
type Installation={id:string;version:number};
async function prefix(apiUrl:string){return 'wishlist.push.v1.'+await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,validateApiUrl(apiUrl,__DEV__));}
async function knownInstallation(scope:string):Promise<Installation|null>{const saved=await SecureStore.getItemAsync(scope+'.installation');if(!saved)return null;const r=JSON.parse(saved);if(!uuid(r.id)||!Number.isSafeInteger(r.version)||r.version<0||r.version>=2147483647)throw Error('Push installation cannot be restored');return r;}
async function installation(scope:string):Promise<Installation>{const saved=await knownInstallation(scope);if(saved)return saved;const value={id:Crypto.randomUUID(),version:0};await SecureStore.setItemAsync(scope+'.installation',JSON.stringify(value),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});return value;}
export type AuthorizedNotificationTarget={kind:'chat';roomId:string}|{kind:'source';context:SourceChatContext};
export function useNativeNotifications(api:ReturnType<typeof createApi>,apiUrl:string,userId:number|undefined,activeRoom:string|null,onOpen:(target:AuthorizedNotificationTarget)=>void){
 const [permission,setPermission]=useState('unknown'),[registered,setRegistered]=useState(false),[busy,setBusy]=useState(false),[issue,setIssue]=useState('');
 const owner=useRef({userId,apiUrl,api}),callback=useRef(onOpen),opening=useRef(false),lastSync=useRef(0),roomRef=useRef(activeRoom),queuedTarget=useRef<unknown|null>(null),handled=useRef(new Set<string>()),openLatest=useRef<(value:unknown)=>Promise<void>>(async()=>{});owner.current={userId,apiUrl,api};callback.current=onOpen;roomRef.current=activeRoom;
 const same=(expected:number|undefined)=>owner.current.userId===expected&&owner.current.apiUrl===apiUrl&&owner.current.api===api;
 async function disconnectInstallation(){let restoreFailure:unknown,restoreFailed=false;try{const scope=await prefix(apiUrl),consent=userId===undefined?null:await SecureStore.getItemAsync(scope+'.enabled.'+userId);if(consent!==null&&consent!=='0'&&consent!=='1')throw Error('Push consent cannot be restored');const device=consent===null?null:await knownInstallation(scope);if(device)try{await api('/notifications/devices',{method:'DELETE',body:JSON.stringify({deviceId:device.id,registrationVersion:device.version}),timeoutMs:8000});}catch{/* Still unregister the provider when the API is unavailable. */}}catch(failure){restoreFailed=true;restoreFailure=failure;}
 // Signing out must not create or transmit a new installation identity. Even
 // unreadable local state must not skip provider cleanup; the caller still gets
 // an unconfirmed-disconnect error afterward if restoration was unavailable.
 const cleaned=await Promise.allSettled([Notifications.unregisterForNotificationsAsync(),Notifications.dismissAllNotificationsAsync(),Notifications.setBadgeCountAsync(0)]);if(same(userId))setRegistered(false);if(restoreFailed)throw restoreFailure;const failed=cleaned.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;}
 async function disconnect(){await exclusive(disconnectInstallation);}
 async function enable(ask=true){if(!userId)return;const expected=userId;setBusy(true);setIssue('');try{await exclusive(async()=>{
 const scope=await prefix(apiUrl);if(!ask&&await SecureStore.getItemAsync(scope+'.enabled.'+expected)!=='1')return;
 if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('transactions',{name:'商品聊天與面交',importance:Notifications.AndroidImportance.DEFAULT,lockscreenVisibility:Notifications.AndroidNotificationVisibility.PRIVATE});
 let permission=await Notifications.getPermissionsAsync();if(ask&&!permission.granted&&permission.canAskAgain)permission=await Notifications.requestPermissionsAsync();if(same(expected))setPermission(permission.status);
 if(!permission.granted){
 try{const consent=await SecureStore.getItemAsync(scope+'.enabled.'+expected);if(consent!==null&&consent!=='0'&&consent!=='1')throw Error('Push consent cannot be restored');const device=consent===null?null:await knownInstallation(scope);if(device)await api('/notifications/devices',{method:'DELETE',body:JSON.stringify({deviceId:device.id,registrationVersion:device.version}),timeoutMs:8000});}
 finally{await Notifications.unregisterForNotificationsAsync();}if(same(expected)){setRegistered(false);setIssue('permission');}return;}

 if(ask)await SecureStore.setItemAsync(scope+'.enabled.'+expected,'1',{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
 const projectId=Constants.expoConfig?.extra?.eas?.projectId??Constants.easConfig?.projectId;if(typeof projectId!=='string'||!uuid(projectId))throw Error('Push project missing');
 const expoPushToken=(await Notifications.getExpoPushTokenAsync({projectId})).data;
 const device=await installation(scope),next={id:device.id,version:device.version+1};await SecureStore.setItemAsync(scope+'.installation',JSON.stringify(next),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
 if(!same(expected)||await SecureStore.getItemAsync(scope+'.enabled.'+expected)!=='1')return;
 const result=await api<{registered:boolean;deviceId:string;registrationVersion:number}>('/notifications/devices',{method:'POST',body:JSON.stringify({deviceId:next.id,registrationVersion:next.version,expoPushToken,platform:Platform.OS}),timeoutMs:15000});
 if(result.registered!==true||result.deviceId!==next.id||result.registrationVersion!==next.version)throw Error('Registration unconfirmed');if(same(expected)){setRegistered(true);lastSync.current=Date.now();}
 });}catch{if(same(expected)){setRegistered(false);setIssue('registration');}}finally{if(same(expected))setBusy(false);}}
 async function disable(){if(!userId)return;setBusy(true);setIssue('');try{await exclusive(async()=>{try{const scope=await prefix(apiUrl),key=scope+'.enabled.'+userId;if(await SecureStore.getItemAsync(key)!==null)await SecureStore.setItemAsync(key,'0',{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});}finally{await disconnectInstallation();}});}catch{if(same(userId))setIssue('registration');}finally{if(same(userId))setBusy(false);}}
 async function openTarget(value:unknown){let target:NotificationTarget;try{target=parseNotificationTarget(value);}catch{return;}if(handled.current.has(target.eventId))return;if(opening.current){queuedTarget.current=value;return;}opening.current=true;try{
 const scope=await prefix(apiUrl);await SecureStore.setItemAsync(scope+'.target',JSON.stringify(target),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
 // Clear only the matching OS response after its target is durable. A newer
 // notification response must remain available if it arrived during this write.
 const last=Notifications.getLastNotificationResponse();if(last?.notification.request.content.data?.eventId===target.eventId)Notifications.clearLastNotificationResponse();
 if(!userId||target.userId!==userId){setIssue('account');return;}
 let authorized:AuthorizedNotificationTarget;
 if(target.kind==='chat'){const room=parseChatRoom(await api('/chat/conversations/'+target.roomId),userId);if(room.id!==target.roomId)throw Error();authorized={kind:'chat',roomId:room.id};}
 else{const result=await api<{inquiryId:string;context:SourceChatContext}>('/notifications/source-target/'+target.leadId),c=result.context;
 if(!uuid(result.inquiryId)||!c||c.id!==target.leadId||typeof c.title!=='string'||!c.title.trim()||c.title.length>100||typeof c.county!=='string'||typeof c.district!=='string'||typeof c.priceText!=='string'||c.priceText.length>300)throw Error();const url=new URL(c.canonicalUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error();authorized={kind:'source',context:{id:c.id,title:c.title,canonicalUrl:c.canonicalUrl,county:c.county,district:c.district,priceText:c.priceText}};}
 if(!same(target.userId))return;await SecureStore.deleteItemAsync(scope+'.target');setIssue('');handled.current.add(target.eventId);if(handled.current.size>128)handled.current.delete(handled.current.values().next().value!);callback.current(authorized);
 }catch(e){if(e instanceof ApiError&&[403,404].includes(e.status)){try{await SecureStore.deleteItemAsync((await prefix(apiUrl))+'.target');}catch{}setIssue('unavailable');}else setIssue('target');}finally{opening.current=false;const queued=queuedTarget.current;queuedTarget.current=null;if(queued)void openLatest.current(queued);}}
 openLatest.current=openTarget;
 async function retryPending(){try{const saved=await SecureStore.getItemAsync((await prefix(apiUrl))+'.target');if(saved)await openTarget(JSON.parse(saved));}catch{setIssue('target');}}
 useEffect(()=>{setRegistered(false);lastSync.current=0;void Notifications.getPermissionsAsync().then(p=>{if(same(userId))setPermission(p.status);}).catch(()=>setPermission('unknown'));
 Notifications.setNotificationHandler({handleNotification:async notification=>{let owns=false;try{owns=parseNotificationTarget(notification.request.content.data).userId===owner.current.userId;}catch{}const data=notification.request.content.data;const alreadyOpen=owns&&AppState.currentState==='active'&&data?.kind==='chat'&&data?.roomId===roomRef.current;return {shouldShowBanner:owns&&!alreadyOpen,shouldShowList:owns&&!alreadyOpen,shouldPlaySound:owns&&!alreadyOpen,shouldSetBadge:owns};}});
 if(userId){void enable(false);void retryPending();}
 const received=Notifications.addNotificationReceivedListener(()=>DeviceEventEmitter.emit('wishlist:chat-read'));
 const response=Notifications.addNotificationResponseReceivedListener(r=>{void openTarget(r.notification.request.content.data);});
 const last=Notifications.getLastNotificationResponse();if(last)void openTarget(last.notification.request.content.data);
 const foreground=AppState.addEventListener('change',state=>{if(state==='active'&&userId&&Date.now()-lastSync.current>300000)void enable(false);});
 const tokenChanged=Notifications.addPushTokenListener(()=>{if(userId)void enable(false);});
 return()=>{received.remove();response.remove();foreground.remove();tokenChanged.remove();};
 },[api,apiUrl,userId]);
 return {permission,registered,busy,issue,enable,disable,disconnect,retryPending};
}
