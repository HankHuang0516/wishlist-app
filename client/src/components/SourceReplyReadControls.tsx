import {useMemo} from 'react';
import {useAuth} from '../context/AuthContext';
import {api} from '../lib/marketplaceApi';
import {useSourceReplyRead} from '../lib/useSourceReplyRead';
import {getDisplayLocale} from '../utils/localization';
export default function SourceReplyReadControls({roomId,loadedReplies}:{roomId:string;loadedReplies:number}){
 const {token}=useAuth(),read=useMemo(()=>(path:string,init?:RequestInit)=>token?api<unknown>(token,path,init):Promise.reject(Error()),[token]);
 const p=useSourceReplyRead(read,roomId,loadedReplies,()=>window.dispatchEvent(new Event('wishlist:chat-read'))),zh=getDisplayLocale().startsWith('zh');
 return <div className="space-y-2 text-sm text-stone-700">{p.unread!==null&&p.unread>0&&<p>{zh?'原賣家未讀回覆：':'Unread seller replies: '}{p.unread}</p>}{p.canMark&&<button className="min-h-11 rounded-xl border bg-white px-4" disabled={p.busy} onClick={()=>void p.mark()}>{zh?'將已載入的原賣家回覆標記已讀':'Mark loaded seller replies as read'}</button>}{p.issue&&<p role="status">{zh?'原賣家回覆的已讀狀態尚未確認；不會假稱已讀。':'Seller reply read state is unconfirmed.'}</p>}</div>;
}
