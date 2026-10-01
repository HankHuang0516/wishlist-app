import { useEffect,useRef,useState } from 'react';
import { API_URL,getFullApiUrl } from '../config';
import { pendingRequestKey,privatePendingStore } from './webPendingStore';
import { detailOperation,detailCloneReceipt,detailItemText,type DetailOperation } from './legacyDetailWeb';
import { legacyListText as copy } from './legacyWishlistWeb';

/** Local markers prevent blind replay; clone identities also have server receipts. */
export function useLegacyDetailOperation(userId:number|undefined,token:string|null) {
  const alive=useRef(true),generation=useRef(0),gate=useRef(false),readyRef=useRef(false),rawRef=useRef<string|null>(null),key=useRef('');
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[pending,setPending]=useState<DetailOperation|null>(null),[known,setKnown]=useState(false),[checked,setChecked]=useState(false),[issue,setIssue]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  async function restore() {
    const version=generation.current;
    try {
      if(!userId || !token)return;
      const scoped=await pendingRequestKey(getFullApiUrl(),userId,'legacy-detail-operation'),raw=await privatePendingStore.get(scoped),operation=raw?detailOperation(raw):null;
      if(!alive.current || version!==generation.current)return;
      key.current=scoped;rawRef.current=raw;setPending(operation);readyRef.current=true;setReady(true);setKnown(false);setChecked(false);setIssue(raw?operation?.kind==='CLONE'?detailItemText('pending'):copy('pending'):'');
    }catch{if(alive.current && version===generation.current){readyRef.current=false;setReady(false);setIssue(copy('storage'));}}
  }
  useEffect(()=>{void restore();},[userId,token]);
  const allowed=()=>alive.current && readyRef.current && !gate.current && !rawRef.current;
  async function clear(raw:string) {
    const stored=await privatePendingStore.get(key.current);
    if(!alive.current)return;
    if(stored!==null && (stored!==raw || !await privatePendingStore.clear(key.current,raw)))throw new Error('Marker changed');
  }
  async function run(operation:Omit<DetailOperation,'version'|'localOperationId'>,path:string,body:object|undefined,confirm:(ack:unknown)=>void,method:'PUT'|'POST'|'DELETE'='PUT'):Promise<boolean> {
    if(!allowed() || !userId || !token)return false;
    gate.current=true;setBusy(true);setIssue('');setNotice('');
    const version=generation.current,current=()=>alive.current && version===generation.current;
    let raw='',staged=false,confirmed=false;
    try {
      raw=JSON.stringify({...operation,version:1,localOperationId:crypto.randomUUID()});const marker=detailOperation(raw);
      await privatePendingStore.save(key.current,raw);staged=true;
      if(!current())return false;
      rawRef.current=raw;setPending(marker);setKnown(false);setChecked(false);
      const res=await fetch(API_URL+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!current())return false;
      if([400,401,403,404,409,422,429].includes(res.status)) {
        await clear(raw);if(!current())return false;rawRef.current=null;setPending(null);setIssue(copy('denied'));return false;
      }
      if(!res.ok)throw new Error('Unconfirmed');const ack:unknown=await res.json();if(!current())return false;
      confirm(ack);confirmed=true;setKnown(true);setNotice(operation.kind==='CLONE'?detailItemText('created'):copy('confirmed'));
      await clear(raw);if(!current())return false;rawRef.current=null;setPending(null);setKnown(false);
    }catch{if(current()){if(!staged){await restore();if(current())setIssue(copy('storage'));}else setIssue(confirmed?copy('cleanup'):operation.kind==='CLONE'?detailItemText('unknown'):copy('unknown'));}}
    finally{gate.current=false;if(current())setBusy(false);}
    return confirmed;
  }
  async function check(read:()=>Promise<boolean>) {
    if(!rawRef.current || gate.current)return;gate.current=true;setBusy(true);setChecked(false);
    try {const ok=await read();if(alive.current){setChecked(ok);setIssue(ok?'':copy('readFailure'));if(ok)setNotice(copy('checked'));}}
    catch{if(alive.current)setIssue(copy('readFailure'));}
    finally{gate.current=false;if(alive.current)setBusy(false);}
  }
  async function checkClone(mode:'read'|'stop') {
    if(!rawRef.current || gate.current || !token)return;const operation=detailOperation(rawRef.current);if(operation.kind!=='CLONE')return;
    gate.current=true;setBusy(true);setChecked(false);setIssue('');setNotice('');const version=generation.current,current=()=>alive.current && version===generation.current;
    try {
      const path='/items/clone-receipts/'+operation.clientRequestId,
        query='?sourceItemId='+operation.itemId+'&targetWishlistId='+operation.targetWishlistId;
      const response=await fetch(API_URL+path+(mode==='read'?query:'/abandon'),{method:mode==='read'?'GET':'POST',headers:{Authorization:'Bearer '+token,...(mode==='stop'?{'Content-Type':'application/json'}:{})},...(mode==='stop'?{body:JSON.stringify({sourceItemId:operation.itemId,targetWishlistId:operation.targetWishlistId})}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!current())return;if(!response.ok)throw new Error('Unconfirmed receipt');const record=detailCloneReceipt(await response.json(),operation);if(!current())return;
      setKnown(true);setIssue('');setNotice(detailItemText(record.state==='ABANDONED'?'stopped':record.deleted?'deleted':'found'));
    }catch{if(current()){setKnown(false);setIssue(detailItemText('notFound'));}}
    finally{gate.current=false;if(current())setBusy(false);}
  }
  async function acknowledge() {
    if(!rawRef.current || gate.current || !known && !checked)return;gate.current=true;setBusy(true);
    try{await clear(rawRef.current);if(!alive.current)return;rawRef.current=null;setPending(null);setKnown(false);setChecked(false);setIssue('');}
    catch{if(alive.current)setIssue(copy('cleanup'));}finally{gate.current=false;if(alive.current)setBusy(false);}
  }
  function resetFeedback(){if(allowed()){setIssue('');setNotice('');}}
  return {ready,busy,pending,known,checked,issue,notice,allowed,run,check,checkClone,acknowledge,restore,resetFeedback};
}
