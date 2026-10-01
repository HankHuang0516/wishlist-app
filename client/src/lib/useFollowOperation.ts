import { useEffect,useRef,useState } from 'react';
import { API_URL } from '../config';
import { api } from './marketplaceApi';
import { pendingRequestKey,privatePendingStore,PendingStoreError } from './webPendingStore';
import { followJournal,parseFollowJournal,parseFollowState,readFollowOperation,sendFollowOperation,abandonFollowOperation,type FollowResult,type FollowState } from './followWeb';
export function useFollowOperation(token:string,userId:number,onCurrent:(state:FollowState)=>void){
    const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[pending,setPending]=useState<string|null>(null),[result,setResult]=useState<FollowResult|null>(null),[notice,setNotice]=useState(''),[storageError,setStorageError]=useState(false),[discardConfirm,setDiscardConfirm]=useState(false),[reload,setReload]=useState(0);
    const epoch=useRef(0),lock=useRef(true),key=useRef(''),rawRef=useRef<string|null>(null),ack=useRef<FollowResult|null>(null),callback=useRef(onCurrent);callback.current=onCurrent;
    const mark=(raw:string|null)=>{rawRef.current=raw;setPending(raw);};
    const finish=(value:FollowResult,generation:number)=>{
        if(epoch.current!==generation)return;ack.current=value;setResult(value);if(value.current.targetUserId!==null)callback.current(value.current);setNotice('');
    };
    useEffect(()=>{
        const generation=++epoch.current;lock.current=true;setLoading(true);setStorageError(false);setResult(null);ack.current=null;mark(null);setDiscardConfirm(false);
        void(async()=>{try{
            const scope=await pendingRequestKey(API_URL,userId,'social-follow'),raw=await privatePendingStore.get(scope);
            if(epoch.current!==generation)return;key.current=scope;mark(raw);
            if(raw){await parseFollowJournal(raw);if(epoch.current!==generation)return;try{finish(await readFollowOperation(token,raw,userId),generation);}catch{if(epoch.current===generation)setNotice('unknown');}}
        }catch{if(epoch.current===generation){setStorageError(true);setNotice('storage');}}
        finally{if(epoch.current===generation){lock.current=false;setLoading(false);}}})();
        return()=>{epoch.current++;};
    },[token,userId,reload]);
    const change=async(targetId:number,wanted:boolean)=>{
        if(lock.current||rawRef.current||storageError)return;const generation=epoch.current;lock.current=true;setBusy(true);setNotice('');let raw:string|null=null,persisted=false;
        try{
            const state=parseFollowState(await api(token,'/users/me/follow-state/'+targetId),userId,targetId);
            if(epoch.current!==generation)return;
            if(targetId===userId||!state.targetExists){setNotice('unavailable');return;}
            if(state.isFollowing===wanted){callback.current(state);setNotice('unchanged');return;}
            raw=await followJournal(targetId,wanted,state.followingVersion);if(epoch.current!==generation)return;
            await privatePendingStore.save(key.current,raw);persisted=true;if(epoch.current!==generation)return;mark(raw);ack.current=null;setResult(null);
            finish(await sendFollowOperation(token,raw,userId,privatePendingStore,key.current,()=>epoch.current===generation),generation);
        }catch(error){if(epoch.current!==generation)return;if(persisted&&raw){mark(raw);setNotice('unknown');}else if(error instanceof PendingStoreError){setStorageError(true);setNotice('storage');}else setNotice('read');}
        finally{if(epoch.current===generation){lock.current=false;setBusy(false);}}
    };
    const recover=async(mode:'read'|'retry'|'abandon'|'cleanup')=>{
        const raw=rawRef.current;if(!raw||lock.current)return;const generation=epoch.current;lock.current=true;setBusy(true);setDiscardConfirm(false);
        try{
            if(mode==='cleanup'){
                if(!ack.current)return;
                const matched=await privatePendingStore.clear(key.current,raw),remaining=await privatePendingStore.get(key.current);
                if(epoch.current!==generation)return;mark(remaining);ack.current=null;setResult(null);setNotice(!matched&&remaining?'changed':remaining?'other':'cleaned');
            }else finish(ack.current??(mode==='retry'?await sendFollowOperation(token,raw,userId,privatePendingStore,key.current,()=>epoch.current===generation):mode==='abandon'?await abandonFollowOperation(token,raw,userId,()=>epoch.current===generation):await readFollowOperation(token,raw,userId)),generation);
        }catch{if(epoch.current===generation)setNotice(mode==='cleanup'?'cleanup':'unknown');}
        finally{if(epoch.current===generation){lock.current=false;setBusy(false);}}
    };
    return {loading,busy,pending,result,notice,storageError,discardConfirm,setDiscardConfirm,change,recover,retryRead:()=>setReload(n=>n+1),locked:loading||busy||!!pending||storageError};
}
