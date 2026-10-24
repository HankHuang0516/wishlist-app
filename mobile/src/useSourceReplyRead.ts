import {useEffect,useRef,useState} from 'react';
type Read=(path:string,init?:RequestInit)=>Promise<unknown>;
type State={id:string;replySequence:number;lastReadReplySequence:number};
function parse(value:unknown,id:string):State{const r=value as State;if(!r||r.id!==id||![r.replySequence,r.lastReadReplySequence].every(v=>Number.isSafeInteger(v)&&v>=0)||r.lastReadReplySequence>r.replySequence)throw Error('Invalid reply read state');return r;}
export function useSourceReplyRead(read:Read,id:string|null,loadedReplies:number,onChanged:()=>void){
 const [state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[issue,setIssue]=useState(false);const epoch=useRef(0),lock=useRef(false),changed=useRef(onChanged);changed.current=onChanged;
 useEffect(()=>{const g=++epoch.current;setState(null);setIssue(false);if(id)void read('/notifications/source-read/'+id).then(v=>{if(epoch.current===g)setState(parse(v,id));}).catch(()=>{if(epoch.current===g)setIssue(true);});return()=>{epoch.current++;};},[read,id,loadedReplies]);
 const through=state?Math.min(state.replySequence,loadedReplies):0;
 async function mark(){if(!id||!state||lock.current||through<=state.lastReadReplySequence)return;lock.current=true;setBusy(true);setIssue(false);const g=epoch.current;try{const next=parse(await read('/notifications/source-read/'+id,{method:'POST',body:JSON.stringify({throughSequence:through})}),id);if(next.lastReadReplySequence<through)throw Error();if(epoch.current===g){setState(next);changed.current();}}catch{if(epoch.current===g)setIssue(true);}finally{lock.current=false;if(epoch.current===g)setBusy(false);}}
 return {unread:state?Math.max(0,state.replySequence-state.lastReadReplySequence):null,canMark:!!state&&through>state.lastReadReplySequence,busy,issue,mark};
}
