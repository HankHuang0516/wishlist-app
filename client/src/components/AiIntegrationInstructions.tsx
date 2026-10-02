import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL } from '../config';
import { pendingRequestKey, privatePendingStore } from '../lib/webPendingStore';
import { IntegrationConflict, parseIntegrationMarker, requestInstructions } from '../lib/aiIntegrationWeb';
import { integrationText as it } from '../lib/aiIntegrationCopy';
type Marker = { key: string; raw: string };
type Phase = 'loading'|'ready'|'pending'|'copied'|'manual'|'clipboard'|'missing'|'storage'|'conflict'|'cleanup';
export default function AiIntegrationInstructions({ token,userId,onBusy }: { token:string; userId:number; onBusy:(busy:boolean)=>void }) {
  const [phase,setPhase] = useState<Phase>('loading'), [marker,setMarker] = useState<Marker|null>(null), [busy,setBusy] = useState(false), [checked,setChecked] = useState(false), [manual,setManual] = useState('');
  const generation = useRef(0), gate = useRef(false), confirmed = useRef<'copied'|'manual'|null>(null);
  useLayoutEffect(() => { generation.current++; gate.current=false; confirmed.current=null; setPhase('loading');setMarker(null);setManual('');setChecked(false);setBusy(false);onBusy(false);return () => { generation.current++;onBusy(false); }; },[token,userId,onBusy]);
  const load = useCallback(async () => {
    if(gate.current)return;gate.current=true;const epoch=generation.current, active=()=>generation.current===epoch;
    setBusy(true);onBusy(true);setManual('');confirmed.current=null;setChecked(false);
    try { const key=await pendingRequestKey(API_URL,userId,'api-integration'),raw=await privatePendingStore.get(key);if(raw)parseIntegrationMarker(raw);if(!active())return;setMarker(raw?{key,raw}:null);setPhase(raw?'pending':'ready'); }
    catch { if(active())setPhase('storage'); }
    finally { if(active()){gate.current=false;setBusy(false);onBusy(false);} }
  },[userId,onBusy]);
  useEffect(()=>{void load();},[load,token]);
  const cleanup = async (current:Marker,active:()=>boolean) => {
    if(!active())return;
    if(await privatePendingStore.get(current.key)!==current.raw)throw new IntegrationConflict();if(!active())return;
    if(!await privatePendingStore.clear(current.key,current.raw))throw new IntegrationConflict();if(!active())return;
    if(await privatePendingStore.get(current.key)!==null)throw new IntegrationConflict();if(!active())return;
    setMarker(null);setChecked(false);setPhase(confirmed.current??'ready');confirmed.current=null;
  };
  const obtain = async (selectable:boolean) => {
    if(gate.current || ['loading','storage','conflict','cleanup'].includes(phase))return;
    gate.current=true;const epoch=generation.current,active=()=>generation.current===epoch;
    setBusy(true);onBusy(true);setManual('');setChecked(false);confirmed.current=null;let current=marker;
    try {
      const method=current?'GET':'POST';
      if(!current){const key=await pendingRequestKey(API_URL,userId,'api-integration');if(!active())return;const raw=JSON.stringify({version:1,localOperationId:crypto.randomUUID(),startedAt:new Date().toISOString()});parseIntegrationMarker(raw);await privatePendingStore.save(key,raw);if(!active())return;current={key,raw};setMarker(current);}
      const prompt=await requestInstructions(API_URL,token,method,current,active);if(!active())return;
      if(prompt===null){setPhase('missing');return;}
      if(selectable){setManual(prompt);confirmed.current='manual';}
      else {try{if(!active())return;await navigator.clipboard.writeText(prompt);}catch{if(active())setPhase('clipboard');return;}if(!active())return;confirmed.current='copied';}
      await cleanup(current,active);
    }catch(error){if(active())setPhase(error instanceof IntegrationConflict?'conflict':confirmed.current?'cleanup':current?'pending':'storage');}
    finally {if(active()){gate.current=false;setBusy(false);onBusy(false);}}
  };
  const clear = async () => {
    if(gate.current || !marker || !confirmed.current&&!checked)return;
    gate.current=true;const epoch=generation.current,active=()=>generation.current===epoch;setBusy(true);onBusy(true);
    try{await cleanup(marker,active);}catch(error){if(active())setPhase(error instanceof IntegrationConflict?'conflict':'cleanup');}
    finally{if(active()){gate.current=false;setBusy(false);onBusy(false);}}
  };
  const button='inline-flex min-h-11 items-center justify-center rounded-md border border-muji-border px-4 py-2 text-sm disabled:opacity-50';
  const messages:Partial<Record<Phase,Parameters<typeof it>[0]>>={pending:'結果未確認；重開不會自動建立或複製。',copied:'已複製目前指令，請貼到信任的工具。',manual:'已取得目前指令，請自行選取複製。',clipboard:'剪貼簿無法使用，請讀取目前指令或顯示可選取的文字。',missing:'目前沒有可用金鑰；保留原提醒，查詢不會建立。',storage:'無法安全讀取或保存提醒，請重試讀取；尚未複製。',conflict:'另一份本機操作存在，請重新讀取。',cleanup:'指令已取得；提醒尚未清理，只需重試清理。'};
  return <section aria-label={it('AI 整合')} className="mt-8 space-y-4">
    <h2 className="text-xl font-semibold">{it('AI 整合')}</h2>
    <div className="rounded-lg border border-muji-border bg-white p-6 space-y-4">
      <div className="rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50 to-purple-50 p-3"><p className="text-sm font-medium text-blue-800">{it('🤖 讓 AI 幫你管理願望清單')}</p><p className="mt-2 text-sm text-blue-700">{it('指令含您的個人 API 金鑰，只貼給信任的工具；工具可存取您有權限的願望資料。')}</p></div>
      {messages[phase]&&<p role={['clipboard','storage','conflict','cleanup'].includes(phase)?'alert':'status'}>{it(messages[phase]!)}</p>}
      <div className="flex flex-col gap-3">
        {!['loading','storage','conflict','cleanup'].includes(phase)&&<><button className={`${button} bg-gradient-to-r from-blue-500 to-purple-500 text-white`} disabled={busy} onClick={()=>void obtain(false)}>{it(busy?'正在處理…':marker?'讀取目前指令並複製':'一鍵複製 AI 指令')}</button><button className={button} disabled={busy} onClick={()=>void obtain(true)}>{it('顯示可選取的指令')}</button></>}
        <Link to="/api-showcase" className={button}>{it('查看 API 文件')}</Link>
      </div>
      {manual&&<><label className="block text-sm" htmlFor="ai-current-instructions">{it('目前 AI 指令')}</label><textarea id="ai-current-instructions" readOnly value={manual} className="block min-h-64 w-full min-w-0 rounded border p-3 font-mono text-xs"/><button className={button} onClick={()=>{setManual('');if(phase==='manual')setPhase('ready');}}>{it('隱藏指令')}</button></>}
      {marker&&<><p className="text-sm">{it('查詢只反映目前金鑰，不是原操作回執；原請求仍可能稍後完成。')}</p><p className="break-all text-sm">{it('本機操作標記')}：{parseIntegrationMarker(marker.raw).localOperationId}</p>{!confirmed.current&&<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={checked} disabled={busy} onChange={event=>setChecked(event.target.checked)}/>{it('我了解清理不會取消原請求，且查詢不是原操作回執')}</label>}<button className={button} disabled={busy||!confirmed.current&&!checked} onClick={()=>void clear()}>{it('只清理本機提醒')}</button></>}
      {['storage','conflict'].includes(phase)&&<button className={button} disabled={busy} onClick={()=>void load()}>{it('重試讀取本機提醒')}</button>}
    </div>
  </section>;
}
