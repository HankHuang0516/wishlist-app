import {useEffect,useState} from 'react';
import {api} from './marketplaceApi';
import {shouldPauseChatReads} from './useChatReadPause';
export function useUnreadCount(token:string|null,userId:number|undefined){
 const [value,setValue]=useState<{owner:number;token:string;count:number}|null>(null);
 useEffect(()=>{if(!token||!userId){setValue(null);return;}let alive=true,busy=false,paused=false;const abort=new AbortController();
 const read=async(manual=false)=>{if(busy||(!manual&&paused)||document.visibilityState!=='visible')return;busy=true;try{const r=await api<{unreadCount:number}>(token,'/chat/unread',{signal:abort.signal});if(!Number.isSafeInteger(r.unreadCount)||r.unreadCount<0)throw Error();if(alive){paused=false;setValue({owner:userId,token,count:r.unreadCount});}}catch(e){if(shouldPauseChatReads(e))paused=true;}finally{busy=false;}};
 const changed=()=>void read(true),foreground=()=>void read();void read();const interval=window.setInterval(()=>void read(),30000);window.addEventListener('wishlist:chat-read',changed);document.addEventListener('visibilitychange',foreground);
 return()=>{alive=false;abort.abort();clearInterval(interval);window.removeEventListener('wishlist:chat-read',changed);document.removeEventListener('visibilitychange',foreground);};},[token,userId]);
 return value&&value.owner===userId&&value.token===token?value.count:null;
}
