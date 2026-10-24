import {useEffect,useState} from 'react';
import {AppState,DeviceEventEmitter} from 'react-native';
import {ApiError,createApi} from './api';
export function useNativeUnreadCount(api:ReturnType<typeof createApi>,userId:number|undefined){
 const [value,setValue]=useState<{owner:number;count:number}|null>(null);
 useEffect(()=>{if(!userId){setValue(null);return;}let active=true,busy=false,paused=false;
 const read=async(manual=false)=>{if(busy||(!manual&&paused)||AppState.currentState!=='active')return;busy=true;try{const r=await api<{unreadCount:number}>('/chat/unread');if(!Number.isSafeInteger(r.unreadCount)||r.unreadCount<0)throw Error();if(active){paused=false;setValue({owner:userId,count:r.unreadCount});}}catch(e){if(e instanceof ApiError&&[401,403,429].includes(e.status))paused=true;}finally{busy=false;}};
 void read();const timer=setInterval(()=>void read(),30000),state=AppState.addEventListener('change',s=>{if(s==='active')void read();}),changed=DeviceEventEmitter.addListener('wishlist:chat-read',()=>void read(true));
 return()=>{active=false;clearInterval(timer);state.remove();changed.remove();};},[api,userId]);
 return value&&value.owner===userId?value.count:null;
}
