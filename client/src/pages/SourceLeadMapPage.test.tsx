import {describe,it,expect,vi,afterEach,beforeEach} from 'vitest';
import {render,screen,fireEvent,cleanup,act,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import SourceLeadMapPage,{currentLead,mapPoint} from './SourceLeadMapPage';
import {makeSourceLead} from '../__tests__/fixtures/sourceLead';
const auth=vi.hoisted(()=>({token:null as string|null,user:{id:1}}));
vi.mock('../context/AuthContext',()=>({useAuth:()=>auth}));
const dates=()=>({checkedAt:new Date().toISOString(),postedEarliestAt:new Date(Date.now()-86400000).toISOString(),postedLatestAt:new Date(Date.now()-86400000).toISOString()});
const lead=(id='a')=>({...makeSourceLead(id==='a'?1:2),...dates(),title:'來源 '+id});
let originalLocale:string|null;
beforeEach(()=>{originalLocale=localStorage.getItem('user-locale');localStorage.setItem('user-locale','zh-TW')});
afterEach(()=>{auth.token=null;sessionStorage.clear();cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();if(originalLocale===null)localStorage.removeItem('user-locale');else localStorage.setItem('user-locale',originalLocale)});
const page=(items= [lead()],nextCursor:string|null=null)=>({ok:true,status:200,json:async()=>({enabled:true,items,nextCursor})});
// The summary the server would give for these leads, and a public backend that serves it with a paged list.
const summary=(leads=[lead()])=>{const points=new Map<string,{id:string;latitude:number;longitude:number;count:number;publicPlaceName:string|null}>();for(const l of leads){const key=l.latitude+','+l.longitude,point=points.get(key);if(point)point.count++;else points.set(key,{id:l.id,latitude:l.latitude!,longitude:l.longitude!,count:1,publicPlaceName:l.publicPlaceName});}return {ok:true,status:200,json:async()=>({enabled:true,total:leads.length,points:[...points.values()]})};};
const backend=(all=[lead()],size=25)=>vi.fn(async(url:string,_init?:RequestInit)=>{const u=new URL(url,'https://example.invalid');
 if(u.pathname.endsWith('/source-leads/map'))return summary(all);
 if(u.pathname.endsWith('/source-leads')){const cursor=u.searchParams.get('cursor'),start=cursor?all.findIndex(l=>l.id===cursor)+1:0,items=all.slice(start,start+size);return page(items,start+size<all.length?items[items.length-1].id:null);}
 const one=all.find(l=>u.pathname.endsWith('/source-leads/'+l.id));return one?{ok:true,status:200,json:async()=>one}:{ok:false,status:404,json:async()=>({})};});
const paths=(f:{mock:{calls:unknown[][]}})=>f.mock.calls.map(call=>String(call[0]).replace(/^.*\/api/,''));
describe('existing card → contact seller → contextual Wishlist AI chat',()=>{
 it('leaves freshness to the server (no passive expiry) but rejects impossible dates; concrete WGS84 projections',()=>{expect(currentLead(lead())).toBe(true);expect(currentLead({...lead(),checkedAt:new Date(Date.now()-49*3600000).toISOString()})).toBe(true);expect(currentLead({...lead(),postedEarliestAt:new Date(Date.now()-100*86400000).toISOString()})).toBe(true);expect(currentLead({...lead(),checkedAt:new Date(Date.now()+3600000).toISOString()})).toBe(false);expect(currentLead({...lead(),postedEarliestAt:new Date(Date.now()+3600000).toISOString()})).toBe(false);const p=mapPoint(23,120.2);expect(p.x).toBeGreaterThan(0);expect(p.y).toBeGreaterThan(0);});
 it('reads every place in one summary and the list a page at a time, keeping anonymous contact behind login',async()=>{const a=lead('a'),b=lead('b'),f=backend([a,b],1);vi.stubGlobal('fetch',f);render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByText('2 件來源線索・1 個公共／概略示意位置');
  expect(paths(f)).toEqual(['/source-leads/map','/source-leads?presentation=1&photos=2&approximate=1']);expect(screen.getByText('2件')).toBeTruthy();
  expect(screen.getByRole('button',{name:'查看 '+a.title})).toBeTruthy();expect(screen.queryByRole('button',{name:'查看 '+b.title})).toBeNull();
  expect(screen.getByRole('button',{name:'聯絡賣家'})).toBeTruthy();expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'載入更多來源（已顯示 1／2 件）'}));await screen.findByRole('button',{name:'查看 '+b.title});
  expect(paths(f)[2]).toBe('/source-leads?presentation=1&photos=2&approximate=1&cursor='+a.id);expect(f).toHaveBeenCalledTimes(3);expect(screen.queryByRole('button',{name:/載入更多來源/})).toBeNull();
  expect(screen.getByText('2 件來源線索・1 個公共／概略示意位置')).toBeTruthy();
  expect(f.mock.calls.every(call=>call[1]!.credentials==='omit'&&!(call[1]!.headers as Record<string,string>).Authorization&&!call[1]!.body)).toBe(true);});
 it('read failure never invents zero qualified goods',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('alert');expect(screen.queryByText('0 件來源線索・0 個公共／概略示意位置')).toBeNull();});
 it('a place on the map opens its first lead even when the list has not reached it',async()=>{
  const a=lead('a'),b={...lead('b'),latitude:25.04,longitude:121.55,publicPlaceName:'另一個公開地點'},f=backend([a,b],1);vi.stubGlobal('fetch',f);render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);
  await screen.findByText('2 件來源線索・2 個公共／概略示意位置');expect(screen.getByRole('heading',{name:a.title})).toBeTruthy();expect(screen.queryByRole('button',{name:'查看 '+b.title})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'另一個公開地點'}));await screen.findByRole('heading',{name:b.title});
  expect(paths(f)[2]).toBe('/source-leads/'+b.id+'?presentation=1&photos=2&approximate=1');expect(f).toHaveBeenCalledTimes(3);
  expect((screen.getByLabelText('選擇線索') as HTMLSelectElement).value).toBe(b.id);expect(screen.getByRole('button',{name:'載入更多來源（已顯示 1／2 件）'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'公開地點'}));expect(screen.getByRole('heading',{name:a.title})).toBeTruthy();expect(f).toHaveBeenCalledTimes(3);});
 it('a place whose lead can no longer be read keeps the listed selection and claims nothing about it',async()=>{
  const a=lead('a'),gone={...lead('b'),latitude:25.04,longitude:121.55,publicPlaceName:'已撤下的地點'},f=backend([a],25);const places=summary([a,gone]);
  vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>String(url).endsWith('/source-leads/map')?places:f(url,init)));render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);
  await screen.findByText('2 件來源線索・2 個公共／概略示意位置');fireEvent.click(screen.getByRole('button',{name:'已撤下的地點'}));await waitFor(()=>expect(f.mock.calls.some(call=>String(call[0]).includes(gone.id))).toBe(true));
  expect(screen.getByRole('heading',{name:a.title})).toBeTruthy();expect(screen.queryByRole('heading',{name:gone.title})).toBeNull();expect(screen.queryByRole('alert')).toBeNull();});
});

it('county illustration shows no pickup address, distance or navigation',async()=>{vi.stubGlobal('fetch',backend([{...lead('county'),county:'桃園市',district:'桃園區',locationPrecision:'COUNTY_ILLUSTRATION',publicPlaceName:'桃園市概略示意位置',publicAddress:'桃園市（概略位置，非取貨點）'}]));render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByText('桃園市（概略位置，非取貨點）');expect(screen.getByText(/概略位置是縣市示意，非取貨點/)).toBeTruthy();expect(screen.queryByRole('link',{name:/導航/})).toBeNull();expect(screen.queryByText(/距離.*公里/)).toBeNull();});

it('uses English controls and real completeness while preserving literal source content, photos, URLs and selection',async()=>{
 localStorage.setItem('user-locale','en-US');const a={...lead('a'),title:'來源 {title} $&'},b=lead('b');const f=backend([a,b]);vi.stubGlobal('fetch',f);
 const v=render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByText('2 source leads · 1 public or approximate locations');
 expect(screen.getByRole('heading',{name:'Source lead map'})).toBeTruthy();expect(screen.getByRole('button',{name:'View '+a.title})).toBeTruthy();
 expect(screen.getByText(a.summary)).toBeTruthy();expect(screen.getByText(a.publicFacts!.sourceAccessNotice)).toBeTruthy();expect(screen.getByRole('link',{name:'View original source'})).toHaveAttribute('href',a.canonicalUrl);
 expect(screen.getByText('All source item images have been imported (Source: 2; imported: 2)')).toBeTruthy();expect(screen.getByText('Images successfully viewed this visit: 0')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Next source image'}));expect(screen.getByText('Image 2 of 2 imported images')).toBeTruthy();
 const before=f.mock.calls.length;localStorage.setItem('user-locale','zh-TW');v.rerender(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);
 expect(screen.getByText('第2張，共2張已收錄圖片')).toBeTruthy();expect(f).toHaveBeenCalledTimes(before);
 fireEvent.change(screen.getByLabelText('選擇線索'),{target:{value:b.id}});expect(screen.getByRole('heading',{name:b.title})).toBeTruthy();expect(screen.getByText('第1張，共2張已收錄圖片')).toBeTruthy();expect(f).toHaveBeenCalledTimes(before);
});

it('offers the next page in English and says how much of the list is shown',async()=>{
 localStorage.setItem('user-locale','en-US');vi.stubGlobal('fetch',backend([lead('a'),lead('b')],1));render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);
 expect(await screen.findByRole('button',{name:'Load more sources (showing 1 of 2)'})).toBeEnabled();
});

it('pauses failed reads across timers and foreground changes, then recovers only through explicit public GET',async()=>{
 vi.useFakeTimers();let failing=true;const good=backend(),f=vi.fn(async(url:string,init?:RequestInit)=>{if(failing)throw new Error('private diagnostic fixture');return good(url,init)});vi.stubGlobal('fetch',f);
 render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await act(async()=>{});
 expect(screen.getByRole('alert')).toHaveTextContent('不代表沒有資料');expect(screen.queryByText('讀取中…')).toBeNull();expect(screen.queryByText('private diagnostic fixture')).toBeNull();
 failing=false;await act(async()=>{await vi.advanceTimersByTimeAsync(90000);document.dispatchEvent(new Event('visibilitychange'))});expect(f).toHaveBeenCalledTimes(2);
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'重新讀取來源'}))});expect(screen.getByText('1 件來源線索・1 個公共／概略示意位置')).toBeTruthy();expect(screen.queryByRole('alert')).toBeNull();expect(f).toHaveBeenCalledTimes(4);
 expect(f.mock.calls.every(call=>!(call[1] as RequestInit)?.body)).toBe(true);
});

it('keeps the list current by reading again only the summary and the pages on screen',async()=>{
 vi.useFakeTimers();const all=[lead('a'),lead('b'),{...lead('b'),id:'11111111-1111-4111-8111-000000000003',title:'來源 c'}],f=backend(all,1);vi.stubGlobal('fetch',f);
 render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await act(async()=>{});expect(f).toHaveBeenCalledTimes(2);
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'載入更多來源（已顯示 1／3 件）'}))});expect(f).toHaveBeenCalledTimes(3);expect(screen.getByRole('button',{name:'載入更多來源（已顯示 2／3 件）'})).toBeTruthy();
 all[1]={...all[1],title:'來源 b 已更新'};await act(async()=>{await vi.advanceTimersByTimeAsync(30000)});
 expect(paths(f).slice(3)).toEqual(['/source-leads/map','/source-leads?presentation=1&photos=2&approximate=1','/source-leads?presentation=1&photos=2&approximate=1&cursor='+all[0].id]);
 expect(screen.getByRole('button',{name:'查看 來源 b 已更新'})).toBeTruthy();expect(screen.getByRole('button',{name:'載入更多來源（已顯示 2／3 件）'})).toBeTruthy();
});

it('rejects repeated cursors and malformed source pages without claiming partial or zero results',async()=>{
 const a=lead(),f=vi.fn(async(url:string,_init?:RequestInit)=>String(url).endsWith('/source-leads/map')?summary([a,lead('b')]):page([a],a.id));vi.stubGlobal('fetch',f);const v=render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'載入更多來源（已顯示 1／2 件）'}));await screen.findByRole('alert');expect(f).toHaveBeenCalledTimes(3);
 expect(screen.queryByRole('heading',{name:a.title})).toBeNull();expect(screen.queryByText(/件來源線索/)).toBeNull();
 f.mockResolvedValue({ok:true,status:200,json:async()=>({items:[],nextCursor:null})} as never);fireEvent.click(screen.getByRole('button',{name:'重新讀取來源'}));await waitFor(()=>expect(f).toHaveBeenCalledTimes(5));expect(screen.getByRole('alert')).toBeTruthy();expect(screen.queryByText(/件來源線索/)).toBeNull();v.unmount();
});

it('refuses a summary whose places do not add up to its total',async()=>{
 const a=lead();vi.stubGlobal('fetch',vi.fn(async(url:string)=>String(url).endsWith('/source-leads/map')?{ok:true,status:200,json:async()=>({enabled:true,total:5,points:[{id:a.id,latitude:23,longitude:120.2,count:1,publicPlaceName:'公開地點'}]})}:page([a])));
 render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('alert');expect(screen.queryByText(/件來源線索/)).toBeNull();expect(screen.queryByRole('heading',{name:a.title})).toBeNull();
});

it('aborts an unfinished public read on departure and ignores its late result',async()=>{
 const pending:((value:unknown)=>void)[]=[];const f=vi.fn((_url:string,_init:RequestInit)=>new Promise(r=>{pending.push(r)}));vi.stubGlobal('fetch',f);
 const v=render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);expect(screen.getByText('讀取中…')).toBeTruthy();expect(f).toHaveBeenCalledTimes(2);const signals=f.mock.calls.map(call=>call[1].signal!);v.unmount();expect(signals.every(signal=>signal.aborted)).toBe(true);await act(async()=>{pending[0](summary());pending[1](page())});
});

it('observes Retry-After without automatically resuming when the wait expires',async()=>{
 vi.useFakeTimers();let limited=true;const good=backend(),f=vi.fn(async(url:string,init?:RequestInit)=>limited?{ok:false,status:429,headers:new Headers({'Retry-After':'2'}),json:async()=>({errorCode:'RATE_LIMIT_EXCEEDED'})}:good(url,init));vi.stubGlobal('fetch',f);
 render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await act(async()=>{});const button=screen.getByRole('button',{name:'重新讀取來源'});expect(button).toBeDisabled();const calls=f.mock.calls.length;
 limited=false;await act(async()=>{await vi.advanceTimersByTimeAsync(3000)});expect(button).toBeEnabled();expect(f).toHaveBeenCalledTimes(calls);await act(async()=>fireEvent.click(button));expect(screen.getByText('1 件來源線索・1 個公共／概略示意位置')).toBeTruthy();
});
