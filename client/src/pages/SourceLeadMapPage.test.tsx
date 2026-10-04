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
describe('existing card → contact seller → contextual Wishlist AI chat',()=>{
 it('keeps TPE two-month/freshness gate and concrete WGS84 projections',()=>{expect(currentLead(lead())).toBe(true);expect(currentLead({...lead(),checkedAt:new Date(Date.now()-49*3600000).toISOString()})).toBe(false);expect(currentLead({...lead(),postedEarliestAt:new Date(Date.now()-100*86400000).toISOString()})).toBe(false);const p=mapPoint(23,120.2);expect(p.x).toBeGreaterThan(0);expect(p.y).toBeGreaterThan(0);});
 it('reads full pagination and keeps anonymous contact behind login',async()=>{const f=vi.fn().mockResolvedValueOnce(page([lead('a')],lead('a').id)).mockResolvedValueOnce(page([lead('b')]));vi.stubGlobal('fetch',f);render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByText('2 件來源線索・1 個公共／概略示意位置');expect(screen.getByRole('button',{name:'聯絡賣家'})).toBeTruthy();expect(screen.queryByRole('textbox')).toBeNull();expect(f).toHaveBeenCalledTimes(2);expect(f.mock.calls.every(call=>call[1].credentials==='omit'&&!call[1].headers.Authorization&&!call[1].body)).toBe(true);});
 it('read failure never invents zero qualified goods',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('alert');expect(screen.queryByText('0 件來源線索・0 個公共／概略示意位置')).toBeNull();});
});

it('county illustration shows no pickup address, distance or navigation',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(page([{...lead('county'),county:'桃園市',district:'桃園區',locationPrecision:'COUNTY_ILLUSTRATION',publicPlaceName:'桃園市概略示意位置',publicAddress:'桃園市（概略位置，非取貨點）'}])));render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByText('桃園市（概略位置，非取貨點）');expect(screen.getByText(/概略位置是縣市示意，非取貨點/)).toBeTruthy();expect(screen.queryByRole('link',{name:/導航/})).toBeNull();expect(screen.queryByText(/距離.*公里/)).toBeNull();});

it('uses English controls and real completeness while preserving literal source content, photos, URLs and selection',async()=>{
 localStorage.setItem('user-locale','en-US');const a={...lead('a'),title:'來源 {title} $&'},b=lead('b');const f=vi.fn().mockResolvedValue(page([a,b]));vi.stubGlobal('fetch',f);
 const v=render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByText('2 source leads · 1 public or approximate locations');
 expect(screen.getByRole('heading',{name:'Source lead map'})).toBeTruthy();expect(screen.getByRole('button',{name:'View '+a.title})).toBeTruthy();
 expect(screen.getByText(a.summary)).toBeTruthy();expect(screen.getByText(a.publicFacts!.sourceAccessNotice)).toBeTruthy();expect(screen.getByRole('link',{name:'View original source'})).toHaveAttribute('href',a.canonicalUrl);
 expect(screen.getByText('All source item images have been imported (Source: 2; imported: 2)')).toBeTruthy();expect(screen.getByText('Images successfully viewed this visit: 0')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Next source image'}));expect(screen.getByText('Image 2 of 2 imported images')).toBeTruthy();
 const before=f.mock.calls.length;localStorage.setItem('user-locale','zh-TW');v.rerender(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);
 expect(screen.getByText('第2張，共2張已收錄圖片')).toBeTruthy();expect(f).toHaveBeenCalledTimes(before);
 fireEvent.change(screen.getByLabelText('選擇線索'),{target:{value:b.id}});expect(screen.getByRole('heading',{name:b.title})).toBeTruthy();expect(screen.getByText('第1張，共2張已收錄圖片')).toBeTruthy();expect(f).toHaveBeenCalledTimes(before);
});

it('pauses failed reads across timers and foreground changes, then recovers only through explicit public GET',async()=>{
 vi.useFakeTimers();let failing=true;const f=vi.fn(async(_url:string,_init:RequestInit)=>{if(failing)throw new Error('private diagnostic fixture');return page()});vi.stubGlobal('fetch',f);
 render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await act(async()=>{});
 expect(screen.getByRole('alert')).toHaveTextContent('不代表沒有資料');expect(screen.queryByText('讀取中…')).toBeNull();expect(screen.queryByText('private diagnostic fixture')).toBeNull();
 failing=false;await act(async()=>{await vi.advanceTimersByTimeAsync(90000);document.dispatchEvent(new Event('visibilitychange'))});expect(f).toHaveBeenCalledTimes(1);
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'重新讀取來源'}))});expect(screen.getByText('1 件來源線索・1 個公共／概略示意位置')).toBeTruthy();expect(screen.queryByRole('alert')).toBeNull();expect(f).toHaveBeenCalledTimes(2);
 expect(f.mock.calls.every(call=>!(call[1] as RequestInit)?.body)).toBe(true);
});

it('rejects repeated cursors and malformed source pages without claiming partial or zero results',async()=>{
 const a=lead(),f=vi.fn().mockResolvedValue(page([a],a.id));vi.stubGlobal('fetch',f);const v=render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('alert');expect(f).toHaveBeenCalledTimes(2);
 expect(screen.queryByRole('heading',{name:a.title})).toBeNull();expect(screen.queryByText(/0 件來源線索/)).toBeNull();
 f.mockResolvedValue({ok:true,status:200,json:async()=>({items:[],nextCursor:null})});fireEvent.click(screen.getByRole('button',{name:'重新讀取來源'}));await waitFor(()=>expect(f).toHaveBeenCalledTimes(3));expect(screen.getByRole('alert')).toBeTruthy();v.unmount();
});

it('aborts an unfinished public read on departure and ignores its late result',async()=>{
 let resolve!:(value:unknown)=>void;const f=vi.fn((_url:string,_init:RequestInit)=>new Promise(r=>{resolve=r}));vi.stubGlobal('fetch',f);
 const v=render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);expect(screen.getByText('讀取中…')).toBeTruthy();const signal=f.mock.calls[0][1].signal!;v.unmount();expect(signal.aborted).toBe(true);await act(async()=>resolve(page()));
});

it('observes Retry-After without automatically resuming when the wait expires',async()=>{
 vi.useFakeTimers();const f=vi.fn().mockResolvedValueOnce({ok:false,status:429,headers:new Headers({'Retry-After':'2'}),json:async()=>({errorCode:'RATE_LIMIT_EXCEEDED'})}).mockResolvedValue(page());vi.stubGlobal('fetch',f);
 render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await act(async()=>{});const button=screen.getByRole('button',{name:'重新讀取來源'});expect(button).toBeDisabled();
 await act(async()=>{await vi.advanceTimersByTimeAsync(3000)});expect(button).toBeEnabled();expect(f).toHaveBeenCalledTimes(1);await act(async()=>fireEvent.click(button));expect(screen.getByText('1 件來源線索・1 個公共／概略示意位置')).toBeTruthy();
});
