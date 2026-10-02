import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { buildAiInstructions } from '../../../server/src/lib/aiIntegrationPrompt';
import AiIntegrationInstructions from './AiIntegrationInstructions';
import { pendingRequestKey, privatePendingStore } from '../lib/webPendingStore';
const pending=vi.hoisted(()=>new Map<string,string>());
vi.mock('../lib/webPendingStore',async original=>({...await original<typeof import('../lib/webPendingStore')>(),privatePendingStore:{get:vi.fn(),save:vi.fn(),clear:vi.fn()}}));
const busy=vi.fn(),scope={token:'synthetic-session',userId:19,onBusy:busy};
const view=(props=scope)=><MemoryRouter><AiIntegrationInstructions {...props}/></MemoryRouter>;
const reply=()=>buildAiInstructions('synthetic-personal-key','Synthetic','http://localhost:8000/api');
const ok=(value:unknown)=>({ok:true,status:200,json:async()=>value});
const marker=()=>JSON.stringify({version:1,localOperationId:crypto.randomUUID(),startedAt:new Date().toISOString()});
beforeEach(()=>{
  pending.clear();localStorage.setItem('user-locale','en-US');busy.mockClear();
  vi.mocked(privatePendingStore.get).mockReset().mockImplementation(async key=>pending.get(key)??null);
  vi.mocked(privatePendingStore.save).mockReset().mockImplementation(async(key,raw)=>{if(pending.has(key)&&pending.get(key)!==raw)throw Error();pending.set(key,raw);});
  vi.mocked(privatePendingStore.clear).mockReset().mockImplementation(async(key,raw)=>{if(pending.get(key)!==raw)return false;pending.delete(key);return true;});
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn(async()=>{})}});vi.stubGlobal('fetch',vi.fn(async()=>ok(reply())));
});
afterEach(()=>{localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
const ready=()=>screen.findByRole('button',{name:'Copy AI instructions'});
describe('account-scoped AI instruction acquisition and recovery',()=>{
  it('opens without dispatch and saves only three nonsecret fields before copying',async()=>{
    render(view());const button=await ready();expect(fetch).not.toHaveBeenCalled();fireEvent.click(button);await screen.findByText('Current instructions copied. Paste into a trusted tool.');const [,raw]=vi.mocked(privatePendingStore.save).mock.calls[0];expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['localOperationId','startedAt','version']);expect(raw).not.toMatch(/synthetic-session|personal-key|authentication|prompt/);expect(navigator.clipboard.writeText).toHaveBeenCalledWith(reply().prompt);expect(pending.size).toBe(0);expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('same-turn double click sends and copies only once',async()=>{
    let finish!:(value:unknown)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise(resolve=>{finish=resolve;})));render(view());const button=await ready();fireEvent.click(button);fireEvent.click(button);await waitFor(()=>expect(finish).toBeTypeOf('function'));expect(fetch).toHaveBeenCalledTimes(1);await act(async()=>finish(ok(reply())));await screen.findByText('Current instructions copied. Paste into a trusted tool.');expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  });
  it('reopens an unknown request without POST or copy and recovers by GET only',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('lost reply');}));const first=render(view());fireEvent.click(await ready());await screen.findByText('The result is unconfirmed. Reopening never creates or copies automatically.');const raw=[...pending.values()][0];first.unmount();vi.stubGlobal('fetch',vi.fn(async()=>ok(reply())));render(view());await screen.findByText('The result is unconfirmed. Reopening never creates or copies automatically.');expect(fetch).not.toHaveBeenCalled();expect([...pending.values()][0]).toBe(raw);fireEvent.click(screen.getByRole('button',{name:'Read and copy current instructions'}));await screen.findByText('Current instructions copied. Paste into a trusted tool.');expect(fetch).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({method:'GET'}));expect(pending.size).toBe(0);
  });
  it('missing current key retains reminder and never creates during recovery',async()=>{
    const key=await pendingRequestKey('http://localhost:8000/api',19,'api-integration'),raw=marker();pending.set(key,raw);vi.stubGlobal('fetch',vi.fn(async()=>ok({available:false})));render(view());fireEvent.click(await screen.findByRole('button',{name:'Read and copy current instructions'}));await screen.findByText('No current key is available. The original reminder remains; reading does not create a key.');expect(pending.get(key)).toBe(raw);expect(navigator.clipboard.writeText).not.toHaveBeenCalled();expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe('GET');
  });
  it('clipboard rejection retains marker and offers explicit selectable current text through GET',async()=>{
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(Error('not allowed'));render(view());fireEvent.click(await ready());await screen.findByText('Clipboard unavailable. Read current instructions or show selectable text.');expect(pending.size).toBe(1);expect(screen.queryByRole('textbox')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Show selectable instructions'}));await screen.findByText('Current instructions obtained. Select and copy the text yourself.');expect(screen.getByRole('textbox')).toHaveValue(reply().prompt);expect(vi.mocked(fetch).mock.calls.map(([,init])=>init?.method)).toEqual(['POST','GET']);expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);expect(pending.size).toBe(0);fireEvent.click(screen.getByRole('button',{name:'Hide instructions'}));expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('unavailable clipboard has the same usable manual alternative',async()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});render(view());fireEvent.click(await ready());await screen.findByText('Clipboard unavailable. Read current instructions or show selectable text.');fireEvent.click(screen.getByRole('button',{name:'Show selectable instructions'}));expect(await screen.findByRole('textbox')).toHaveValue(reply().prompt);
  });
  it('rejects malformed replies without copying or clearing reminders',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>ok({...reply(),apiKey:'different-key'})));render(view());fireEvent.click(await ready());await screen.findByText('The result is unconfirmed. Reopening never creates or copies automatically.');expect(navigator.clipboard.writeText).not.toHaveBeenCalled();expect(pending.size).toBe(1);
  });
  it('blocks dispatch when storage fails and exposes a retry without network writes',async()=>{
    vi.mocked(privatePendingStore.save).mockRejectedValueOnce(Error());render(view());fireEvent.click(await ready());await screen.findByText('The reminder could not be read or saved safely. Retry reading; nothing was copied.');expect(fetch).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Retry reading local reminder'}));await ready();expect(fetch).not.toHaveBeenCalled();
  });
  it('cleanup failure offers cleanup only and never recopies or retransmits',async()=>{
    vi.mocked(privatePendingStore.clear).mockRejectedValueOnce(Error());render(view());fireEvent.click(await ready());await screen.findByText('Instructions obtained. The reminder needs cleanup; retry cleanup only.');expect(screen.queryByRole('button',{name:'Read and copy current instructions'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Clear local reminder only'}));await screen.findByText('Current instructions copied. Paste into a trusted tool.');expect(fetch).toHaveBeenCalledTimes(1);expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);expect(pending.size).toBe(0);
  });
  it('a newer marker survives the older reply',async()=>{
    let finish!:(value:unknown)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise(resolve=>{finish=resolve;})));render(view());fireEvent.click(await ready());await waitFor(()=>expect(finish).toBeTypeOf('function'));const key=[...pending.keys()][0],newer=marker();pending.set(key,newer);await act(async()=>finish(ok(reply())));await screen.findByText('Another local operation exists. Read the reminder again.');expect(pending.get(key)).toBe(newer);expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
  it('late old-account reply never begins a clipboard write or affects the new account',async()=>{
    let finish!:(value:unknown)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise(resolve=>{finish=resolve;})));const page=render(view());fireEvent.click(await ready());await waitFor(()=>expect(finish).toBeTypeOf('function'));page.rerender(view({...scope,userId:20,token:'new-synthetic-session'}));await ready();await act(async()=>finish(ok(reply())));expect(navigator.clipboard.writeText).not.toHaveBeenCalled();expect(pending.size).toBe(1);expect(screen.queryByText('Current instructions copied. Paste into a trusted tool.')).toBeNull();
  });
  it('manual secret is removed when owner or token changes',async()=>{
    const page=render(view());await ready();fireEvent.click(screen.getByRole('button',{name:'Show selectable instructions'}));await screen.findByRole('textbox');page.rerender(view({...scope,token:'new-session'}));await ready();expect(screen.queryByRole('textbox')).toBeNull();expect(document.body.textContent).not.toContain('synthetic-personal-key');
  });
  it('unknown cleanup requires explicit acknowledgement and performs no request',async()=>{
    const key=await pendingRequestKey('http://localhost:8000/api',19,'api-integration');pending.set(key,marker());render(view());const clear=await screen.findByRole('button',{name:'Clear local reminder only'});expect(clear).toBeDisabled();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(clear);await ready();expect(pending.size).toBe(0);expect(fetch).not.toHaveBeenCalled();expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
  it('Traditional Chinese includes current-key and manual-copy meaning',async()=>{
    localStorage.setItem('user-locale','zh-TW');render(view());fireEvent.click(await screen.findByRole('button',{name:'顯示可選取的指令'}));await screen.findByText('已取得目前指令，請自行選取複製。');expect(screen.queryByText('已複製目前指令，請貼到信任的工具。')).toBeNull();
  });
});
