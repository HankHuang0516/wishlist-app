import { useEffect,useRef,useState } from 'react';
import { API_URL } from '../config';
import { AuthFlowError,object,rejection } from './authFlowWeb';
import { authSession,parseAuthUser } from './authSession';

/** One explicit dispatch per page. Abort/late replies never change another route. */
export function useAuthRequest(scope = '') {
  const [busy,setBusy]=useState(false);
  const active=useRef(true),sending=useRef(false),controller=useRef<AbortController|null>(null),currentScope=useRef(scope);
  currentScope.current=scope;
  useEffect(()=>{ active.current=true; return ()=>{active.current=false;controller.current?.abort();}; },[]);
  useEffect(()=>{ controller.current?.abort(); sending.current=false;setBusy(false); },[scope]);
  async function run(path:'/login'|'/register'|'/verify-email'|'/reset-password'|'/forgot-password'|'/resend-verification',payload:object):Promise<Record<string,unknown>|null> {
    if(!active.current||sending.current) return null;
    sending.current=true;setBusy(true);
    const abort=new AbortController(),originalScope=currentScope.current;controller.current=abort;
    const isCurrent=()=>active.current&&!abort.signal.aborted&&currentScope.current===originalScope&&controller.current===abort;
    try {
      const response=await fetch(API_URL+'/auth'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',redirect:'error',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])});
      if(!isCurrent()) return null;
      let data:Record<string,unknown>;
      try {data=object(await response.json());} catch {throw new AuthFlowError('invalidResponse',true);}
      if(!isCurrent()) return null;
      if(!response.ok) throw rejection(response.status,data);
      if(path==='/login') {
        let session;try{session=authSession(data.token,data.user);}catch{throw new AuthFlowError('invalidResponse',true);}
        const profile=await fetch(API_URL+'/users/me',{headers:{Authorization:'Bearer '+session.token},cache:'no-store',redirect:'error',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])});
        if(!isCurrent())return null;
        if(profile.status===401)throw new AuthFlowError('invalidCredentials');
        if(!profile.ok)throw new AuthFlowError('unknown',true);
        let user;try{user=parseAuthUser(await profile.json());if(user.id!==session.user.id)throw new Error('Identity mismatch');}catch{throw new AuthFlowError('invalidResponse',true);}
        if(!isCurrent())return null;
        return {token:session.token,user};
      }
      return data;
    } catch(error) {
      if(!isCurrent()) return null;
      throw error instanceof AuthFlowError?error:new AuthFlowError('unknown',true);
    } finally { if(controller.current===abort){sending.current=false;if(active.current)setBusy(false);} }
  }
  return {busy,run};
}
