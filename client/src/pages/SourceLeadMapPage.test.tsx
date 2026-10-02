import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SourceLeadMapPage, { mapPoint, currentLead } from './SourceLeadMapPage';
const dates=()=>({checkedAt:new Date().toISOString(),postedEarliestAt:new Date(Date.now()-86400000).toISOString(),postedLatestAt:new Date(Date.now()-86400000).toISOString()});
const auth=vi.hoisted(()=>({token:null as string|null,user:{id:1}}));
vi.mock('../context/AuthContext',()=>({useAuth:()=>auth}));
beforeEach(()=>{localStorage.setItem('user-locale','zh-TW')});
afterEach(()=>{auth.token=null;sessionStorage.clear();localStorage.clear();cleanup();vi.unstubAllGlobals()});
describe('source lead public map',()=>{
 it('keeps original question bytes through English save, consent and lost-reply GET recovery',async()=>{
  localStorage.setItem('user-locale','en-US');auth.token='synthetic-token';
  const row={...dates(),id:'a',title:'原公開來源',summary:'原來源摘要',canonicalUrl:'https://example.invalid/a',publicPlaceName:'原公共地點',publicAddress:'原公共地址',latitude:23,longitude:120.2};
  let room:any=null;const question='原中文問題 250.7500 USD';
  const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
   if(url.endsWith('/source-leads'))return{ok:true,json:async()=>({items:[row],nextCursor:null})};
   if(url.endsWith('/inquiry')){if(init?.method==='POST')room={id:'original-room',state:'INQUIRY',events:[],transferHash:'original-hash',delivered:false};return{ok:true,json:async()=>room};}
   if(url.endsWith('/actions')){const payload=JSON.parse(String(init?.body));room={...room,events:[...room.events,payload],state:payload.action==='CONSENT'?'WAITING_ROUTE':'INQUIRY'};return payload.action==='CONSENT'?{ok:false,status:502}:{ok:true,json:async()=>room};}
   return{ok:true,json:async()=>row};
  });vi.stubGlobal('fetch',fetch);render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('heading',{name:'原公開來源'});
  expect(screen.getByRole('heading',{name:'Source lead map'})).toBeInTheDocument();expect(screen.getByText('Source leads: 1 · Public places: 1')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox',{name:'Question'}),{target:{value:question}});
  expect(screen.getByRole('textbox',{name:'Question'})).toHaveValue(question);expect(screen.getByRole('button',{name:'Save question'})).toBeEnabled();
  fireEvent.click(screen.getByRole('button',{name:'Save question'}));await screen.findByText(question);
  const consent=screen.getByRole('button',{name:'Consent to forward only the questions above to the verified original seller'});fireEvent.click(consent);await screen.findByRole('alert');
  expect(screen.getByRole('alert')).toHaveTextContent('The operation is unconfirmed');const marker=sessionStorage.getItem('source-lead-request:1:a');expect(marker).toBeTruthy();expect(marker).not.toContain(question);
  fireEvent.click(screen.getByRole('button',{name:'Read saved inquiry'}));await screen.findByText(/WAITING_ROUTE/);expect(screen.getByText(question)).toBeInTheDocument();expect(screen.getByText(/Not sent to the seller/)).toBeInTheDocument();expect(sessionStorage.getItem('source-lead-request:1:a')).toBeNull();
  const actions=fetch.mock.calls.filter(([url])=>url.endsWith('/actions'));expect(actions).toHaveLength(2);expect(JSON.parse(String(actions[0][1]?.body))).toEqual({requestId:expect.any(String),action:'ASK',text:question});expect(JSON.parse(String(actions[1][1]?.body))).toEqual({requestId:expect.any(String),action:'CONSENT',consent:true,transferHash:'original-hash'});
  expect(fetch.mock.calls.filter(([url,init])=>url.endsWith('/inquiry')&&init?.method==='POST')).toHaveLength(1);expect(screen.queryByRole('button',{name:'Consent to forward only the questions above to the verified original seller'})).toBeNull();
 });
 it('keeps an unavailable deep link on its original inquiry instead of selecting another public lead',async()=>{
  auth.token='synthetic-token';
  const row={...dates(),id:'b',title:'Other public lead',summary:'Original public summary',canonicalUrl:'https://example.invalid/b',publicPlaceName:'Public place',publicAddress:'Public address',latitude:23,longitude:120.2};
  const fetch=vi.fn(async(url:string,init?:RequestInit)=>({ok:true,json:async()=>url.endsWith('/source-leads')?{items:[row],nextCursor:null}:{id:'original-room',state:'INQUIRY',available:false,events:[{requestId:'original-request',action:'ASK',text:'Original private question'}],transferHash:'x',delivered:false}}));
  vi.stubGlobal('fetch',fetch);render(<MemoryRouter initialEntries={['/source-leads?id=a']}><SourceLeadMapPage/></MemoryRouter>);
  await screen.findByText('1 件來源線索・1 個公共地點');
  expect(screen.getByRole('combobox')).toHaveValue('a');expect(screen.queryByRole('heading',{name:'Other public lead'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'讀取已存詢問'}));await screen.findByText('Original private question');
  expect(fetch.mock.calls.filter(([url])=>!url.endsWith('/source-leads'))).toEqual([[expect.stringMatching(/\/a\/inquiry$/),expect.objectContaining({method:'GET'})]]);
  expect(screen.getByRole('button',{name:'保存問題'})).toBeDisabled();expect(screen.getByRole('button',{name:'同意只轉交上列問題給核實的原賣家'})).toBeDisabled();
 });
 it('an empty public list still reads an unknown original request without allocating or clearing it',async()=>{
  auth.token='synthetic-token';const journal=JSON.stringify({requestId:'unknown-original',action:'ASK'});sessionStorage.setItem('source-lead-request:1:a',journal);
  const fetch=vi.fn(async(url:string,init?:RequestInit)=>({ok:true,json:async()=>url.endsWith('/source-leads')?{items:[],nextCursor:null}:null}));
  vi.stubGlobal('fetch',fetch);render(<MemoryRouter initialEntries={['/source-leads?id=a']}><SourceLeadMapPage/></MemoryRouter>);await screen.findByText('0 件來源線索・0 個公共地點');
  fireEvent.click(screen.getByRole('button',{name:'讀取已存詢問'}));await screen.findByText('上次操作結果仍待確認；請勿新增重複問題');
  expect(sessionStorage.getItem('source-lead-request:1:a')).toBe(journal);expect(fetch.mock.calls.filter(([url])=>!url.endsWith('/source-leads'))).toEqual([[expect.stringMatching(/\/a\/inquiry$/),expect.objectContaining({method:'GET'})]]);
 });
 it('pins the initial selection through a public refresh and withdraws only the original inquiry',async()=>{
  auth.token='synthetic-token';const row=(id:string)=>({...dates(),id,title:'Source '+id,summary:'Public summary',canonicalUrl:'https://example.invalid/'+id,publicPlaceName:'Public place',publicAddress:'Public address',latitude:23,longitude:120.2});let publicReads=0;
  const fetch=vi.fn(async(url:string,init?:RequestInit)=>({ok:true,json:async()=>url.endsWith('/source-leads')?{items:++publicReads===1?[row('a'),row('b')]:[row('b')],nextCursor:null}:url.endsWith('/actions')?{id:'room-a',state:'CANCELLED',events:[{action:'ASK',text:'Original question'}],transferHash:'x'}:{id:'room-a',state:'INQUIRY',available:false,events:[{action:'ASK',text:'Original question'}],transferHash:'x'}}));
  vi.stubGlobal('fetch',fetch);render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('heading',{name:'Source a'});await waitFor(()=>expect(screen.getByRole('combobox')).toHaveValue('a'));
  fireEvent(document,new Event('visibilitychange'));await screen.findByText('1 件來源線索・1 個公共地點');expect(screen.getByRole('combobox')).toHaveValue('a');expect(screen.queryByRole('heading',{name:'Source b'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'讀取已存詢問'}));await screen.findByText('Original question');fireEvent.click(screen.getByRole('button',{name:'撤回委託'}));await screen.findByText(/CANCELLED/);
  const writes=fetch.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1);expect(writes[0][0]).toMatch(/\/a\/inquiry\/room-a\/actions$/);expect(JSON.parse(String(writes[0][1]?.body))).toEqual({requestId:expect.any(String),action:'CANCEL'});
 });
 it('does not expose a late original private receipt after explicitly choosing another lead',async()=>{
  auth.token='synthetic-token';const row=(id:string)=>({...dates(),id,title:'Source '+id,summary:'Public summary',canonicalUrl:'https://example.invalid/'+id,publicPlaceName:'Public place',publicAddress:'Public address',latitude:23,longitude:120.2});let finish!:(room:unknown)=>void;
  const fetch=vi.fn(async(url:string)=>url.endsWith('/source-leads')?{ok:true,json:async()=>({items:[row('a'),row('b')],nextCursor:null})}:{ok:true,json:()=>new Promise(resolve=>{finish=resolve})});
  vi.stubGlobal('fetch',fetch);render(<MemoryRouter initialEntries={['/source-leads?id=a']}><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('heading',{name:'Source a'});fireEvent.click(screen.getByRole('button',{name:'讀取已存詢問'}));await waitFor(()=>expect(finish).toBeTypeOf('function'));
  fireEvent.change(screen.getByRole('combobox'),{target:{value:'b'}});await screen.findByRole('heading',{name:'Source b'});finish({id:'late-a',state:'INQUIRY',events:[{action:'ASK',text:'Late private A question'}],transferHash:'x'});
  await waitFor(()=>expect(screen.getByRole('button',{name:'讀取已存詢問'})).toBeEnabled());expect(screen.queryByText('Late private A question')).toBeNull();expect(fetch.mock.calls).toHaveLength(2);
 });
 it('rejects expired, future, or missing original dates and stale checks',()=>{const row:any={...dates()};expect(currentLead(row)).toBe(true);expect(currentLead({...row,checkedAt:new Date(Date.now()-49*3600000).toISOString()})).toBe(false);expect(currentLead({...row,postedEarliestAt:new Date(Date.now()-100*86400000).toISOString()})).toBe(false);expect(currentLead({...row,postedLatestAt:new Date(Date.now()+86400000).toISOString()})).toBe(false);expect(currentLead({...row,postedEarliestAt:null})).toBe(false);});
 it('projects public WGS84 locations inside Taiwan viewport',()=>{for(const [lat,lng] of [[22.998651,120.2362147],[24.9537692,121.2412775]]){const p=mapPoint(lat,lng);expect(p.x).toBeGreaterThan(0);expect(p.x).toBeLessThan(512);expect(p.y).toBeGreaterThan(0);expect(p.y).toBeLessThan(768)}});
 it('reads all pages and shows public facts with login boundary',async()=>{const lead=(id:string)=>({...dates(),id,title:'來源 '+id,summary:'庫存待確認',canonicalUrl:'https://example.invalid/source/'+id,publicPlaceName:'公開地點',publicAddress:'公共地址',latitude:23,longitude:120.2,stockStatus:'UNKNOWN'});const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({items:[lead('a')],nextCursor:'a'})}).mockResolvedValueOnce({ok:true,json:async()=>({items:[lead('b')],nextCursor:null})});vi.stubGlobal('fetch',fetch);render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByText('2 件來源線索・1 個公共地點');expect(fetch).toHaveBeenCalledTimes(2);expect(screen.getByText('登入後詢問')).toBeTruthy();fireEvent.change(screen.getByRole('combobox'),{target:{value:'b'}});expect(screen.getByRole('heading',{name:'來源 b'})).toBeTruthy();expect(screen.queryByRole('button',{name:'保存問題'})).toBeNull();});
 it('reports read failure instead of inventing zero confirmed goods',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('來源暫時無法讀取'));expect(screen.queryByText('0 件來源線索・0 個公共地點')).toBeNull();});
 it('unknown ASK result recovers the same receipt without another action write',async()=>{
  auth.token='synthetic-token';const row={...dates(),id:'a',title:'來源 a',summary:'待確認',canonicalUrl:'https://example.invalid/a',publicPlaceName:'公共地點',publicAddress:'公共地址',latitude:23,longitude:120.2};let payload:any;let opens=0;const fetch=vi.fn(async(url:string,init:any)=>{
   if(url.endsWith('/actions')){payload=JSON.parse(init.body);throw Error('unknown');}
   if(url.endsWith('/inquiry')){opens++;return{ok:true,json:async()=>({id:'room',state:'INQUIRY',transferHash:'x',events:opens>1?[{...payload,at:'now'}]:[],delivered:false})};}
   return{ok:true,json:async()=>url.endsWith('/source-leads')?{items:[row],nextCursor:null}:row};});vi.stubGlobal('fetch',fetch);render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('heading',{name:'來源 a'});await new Promise(resolve=>setTimeout(resolve,0));fireEvent.change(screen.getByRole('textbox'),{target:{value:'synthetic question'}});fireEvent.click(screen.getByRole('button',{name:'保存問題'}));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'保存問題'}));await screen.findByText('synthetic question');expect(fetch.mock.calls.filter(([url])=>url.endsWith('/actions'))).toHaveLength(1);
 });
 it('READ uses GET only and empty reads do not allocate a receipt; explicit save creates once',async()=>{
  auth.token='synthetic-token';const row={...dates(),id:'a',title:'來源 a',summary:'待確認',canonicalUrl:'https://example.invalid/a',publicPlaceName:'公共地點',publicAddress:'公共地址',latitude:23,longitude:120.2};let created=false;
  const fetch=vi.fn(async(url:string,init:any)=>{
   if(url.endsWith('/inquiry')){if(init.method==='POST')created=true;return{ok:true,json:async()=>created?{id:'room',state:'INQUIRY',events:[],transferHash:'x'}:null};}
   if(url.endsWith('/actions'))return{ok:true,json:async()=>({id:'room',state:'INQUIRY',events:[{action:'ASK',text:'explicit question'}],transferHash:'x'})};
   return{ok:true,json:async()=>url.endsWith('/source-leads')?{items:[row],nextCursor:null}:row};
  });vi.stubGlobal('fetch',fetch);render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('heading',{name:'來源 a'});
  fireEvent.click(screen.getByRole('button',{name:'讀取已存詢問'}));await screen.findByText('尚無已存詢問；填寫內容後按保存問題才會建立');
  expect(fetch.mock.calls.filter(([url,init])=>url.endsWith('/inquiry')&&init.method==='POST')).toHaveLength(0);
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'explicit question'}});fireEvent.click(screen.getByRole('button',{name:'保存問題'}));await screen.findByText('explicit question');
  expect(fetch.mock.calls.filter(([url,init])=>url.endsWith('/inquiry')&&init.method==='POST')).toHaveLength(1);
 });
 it('READ recovers a saved receipt after its public lead disappears without writes',async()=>{
  auth.token='synthetic-token';sessionStorage.setItem('source-lead-request:1:a',JSON.stringify({requestId:'saved-request',action:'ASK'}));
  const row={...dates(),id:'a',title:'來源 a',summary:'待確認',canonicalUrl:'https://example.invalid/a',publicPlaceName:'公共地點',publicAddress:'公共地址',latitude:23,longitude:120.2};
  const fetch=vi.fn(async(url:string)=>url.endsWith('/source-leads')?{ok:true,json:async()=>({items:[row],nextCursor:null})}:url.endsWith('/inquiry')?{ok:true,json:async()=>({id:'same-receipt',state:'INQUIRY',available:false,events:[{requestId:'saved-request',action:'ASK',text:'saved before withdrawal'}],transferHash:'x'})}:{ok:false,status:404});
  vi.stubGlobal('fetch',fetch);render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('heading',{name:'來源 a'});fireEvent.click(screen.getByRole('button',{name:'讀取已存詢問'}));await screen.findByText('saved before withdrawal');
  expect(fetch.mock.calls.map(([url])=>url).filter(url=>!url.endsWith('/source-leads'))).toEqual([expect.stringMatching(/\/inquiry$/)]);expect(sessionStorage.getItem('source-lead-request:1:a')).toBeNull();
 });
 it('CONSENT cannot silently include another device question not displayed at the click',async()=>{
 auth.token='synthetic-token';const row={...dates(),id:'a',title:'來源 a',summary:'待確認',canonicalUrl:'https://example.invalid/a',publicPlaceName:'公共地點',publicAddress:'公共地址',latitude:23,longitude:120.2};let reads=0;
 const fetch=vi.fn(async(url:string,init:any)=>{if(url.endsWith('/inquiry')){reads++;return{ok:true,json:async()=>({id:'room',state:'INQUIRY',transferHash:reads===1?'old':'new',events:[{action:'ASK',text:'displayed question'},...(reads>1?[{action:'ASK',text:'other device added'}]:[])]})};}if(url.endsWith('/actions'))return{ok:true,json:async()=>({id:'room',state:'WAITING_ROUTE',transferHash:'new',events:[{action:'ASK',text:'displayed question'},{action:'ASK',text:'other device added'}]})};return{ok:true,json:async()=>url.endsWith('/source-leads')?{items:[row],nextCursor:null}:row};});
 vi.stubGlobal('fetch',fetch);render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('heading',{name:'來源 a'});fireEvent.click(screen.getByRole('button',{name:'讀取已存詢問'}));await screen.findByText('displayed question');
 fireEvent.click(screen.getByRole('button',{name:'同意只轉交上列問題給核實的原賣家'}));await screen.findByText('問題內容已更新，請重新閱讀後再次確認同意');expect(fetch.mock.calls.filter(([url])=>url.endsWith('/actions'))).toHaveLength(0);expect(screen.getByText('other device added')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'同意只轉交上列問題給核實的原賣家'}));await screen.findByText(/WAITING_ROUTE/);expect(fetch.mock.calls.filter(([url])=>url.endsWith('/actions'))).toHaveLength(1);
 });
 it('logout immediately hides saved private questions from the rendered scope',async()=>{
  auth.token='synthetic-token';const row={...dates(),id:'a',title:'來源 a',summary:'待確認',canonicalUrl:'https://example.invalid/a',publicPlaceName:'公共地點',publicAddress:'公共地址',latitude:23,longitude:120.2};vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url.endsWith('/inquiry')?{id:'room',state:'INQUIRY',events:[{action:'ASK',text:'private question'}],transferHash:'x'}:url.endsWith('/source-leads')?{items:[row],nextCursor:null}:row})));const view=render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('heading',{name:'來源 a'});fireEvent.click(screen.getByRole('button',{name:'讀取已存詢問'}));await screen.findByText('private question');auth.token=null;view.rerender(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);expect(screen.queryByText('private question')).toBeNull();
 });
 it('a definite rejected ASK clears its journal and allows cancellation',async()=>{
 auth.token='synthetic-token';const row={...dates(),id:'a',title:'來源 a',summary:'待確認',canonicalUrl:'https://example.invalid/a',publicPlaceName:'公共地點',publicAddress:'公共地址',latitude:23,longitude:120.2};const fetch=vi.fn(async(url:string,init:any)=>{if(url.endsWith('/actions')){const action=JSON.parse(init.body).action;return action==='ASK'?{ok:false,status:409}:{ok:true,json:async()=>({id:'room',state:'CANCELLED',events:[],transferHash:'x'})};}return{ok:true,json:async()=>url.endsWith('/inquiry')?{id:'room',state:'INQUIRY',events:[],transferHash:'x'}:url.endsWith('/source-leads')?{items:[row],nextCursor:null}:row};});vi.stubGlobal('fetch',fetch);render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('heading',{name:'來源 a'});await new Promise(resolve=>setTimeout(resolve,0));fireEvent.change(screen.getByRole('textbox'),{target:{value:'question'}});fireEvent.click(screen.getByRole('button',{name:'保存問題'}));await screen.findByRole('alert');expect(sessionStorage.getItem('source-lead-request:1:a')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'撤回委託'}));await screen.findByText(/CANCELLED/);
 });
 it('a recovered unknown request blocks new writes until receipt or cancel, without storing private text',async()=>{
 auth.token='synthetic-token';sessionStorage.setItem('source-lead-request:1:a',JSON.stringify({requestId:'old-request',action:'ASK'}));const row={...dates(),id:'a',title:'來源 a',summary:'待確認',canonicalUrl:'https://example.invalid/a',publicPlaceName:'公共地點',publicAddress:'公共地址',latitude:23,longitude:120.2};const fetch=vi.fn(async(url:string)=>({ok:true,json:async()=>url.endsWith('/inquiry')?{id:'room',state:'INQUIRY',events:[],transferHash:'x'}:url.endsWith('/source-leads')?{items:[row],nextCursor:null}:row}));vi.stubGlobal('fetch',fetch);render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('heading',{name:'來源 a'});await new Promise(resolve=>setTimeout(resolve,0));fireEvent.change(screen.getByRole('textbox'),{target:{value:'private new draft'}});fireEvent.click(screen.getByRole('button',{name:'保存問題'}));await screen.findByRole('alert');expect(fetch.mock.calls.some(([url])=>url.endsWith('/actions'))).toBe(false);expect(sessionStorage.getItem('source-lead-request:1:a')).not.toContain('private new draft');auth.token=null;
 });
});
