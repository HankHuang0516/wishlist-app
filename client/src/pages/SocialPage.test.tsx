import { act,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import SocialPage from './SocialPage';
import {webcrypto} from 'node:crypto';
import {sha256} from '../lib/webPendingStore';
const journals=vi.hoisted(()=>new Map<string,string>());
vi.mock('../lib/webPendingStore',async original=>({...await original<object>(),privatePendingStore:{get:vi.fn(async(key:string)=>journals.get(key)??null),save:vi.fn(async(key:string,raw:string)=>{if(journals.has(key)&&journals.get(key)!==raw)throw Error('CAS');journals.set(key,raw);}),clear:vi.fn(async(key:string,raw:string)=>journals.get(key)===raw?journals.delete(key):false)}}));
const state={userId:19,targetUserId:20,targetExists:true,isFollowing:false,followingVersion:0,followingCount:0,isPremium:false,maxFollowing:100};
async function proof(url:string,body:string){const input=JSON.parse(body);return {receipt:{clientActionId:url.split('/').at(-1),requestHash:await sha256(body),...input,state:'APPLIED',appliedVersion:1,createdAt:'2026-10-01T13:00:00.000Z'},current:{...state,isFollowing:true,followingVersion:1,followingCount:1}};}
const auth={user:{id:19,phoneNumber:'synthetic'},token:'social-fixture',login:vi.fn(),logout:vi.fn(),refreshUser:vi.fn(),isAuthenticated:true};
const friend={id:20,name:'合成朋友',nicknames:null,phoneNumber:null,avatarUrl:null,birthday:null,isFollowing:false,isMutual:false};
const self={id:19,maxFollowing:0,isPremium:false};
const ok=(value:unknown)=>({ok:true,status:200,json:async()=>value});
const view=(identity=auth)=><MemoryRouter><AuthContext.Provider value={identity}><SocialPage /></AuthContext.Provider></MemoryRouter>;
const input=()=>screen.getByRole('textbox',{name:'姓名、手機號碼或電子信箱'});
const submit=(query='合成')=>{fireEvent.change(input(),{target:{value:query}});fireEvent.click(screen.getByRole('button',{name:'搜尋使用者'}));};
beforeEach(()=>{journals.clear();vi.stubGlobal('crypto',webcrypto);localStorage.setItem('user-locale','zh-TW');});
afterEach(()=>{localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('actual friends page, safe reads and uncertain mutations',()=>{
    it.each(['zh-TW','en-US'])('search and following preserve the original public calendar date in %s west of UTC',async locale=>{
        localStorage.setItem('user-locale',locale);
        const west=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles'});
        const originalDate='2000-01-01T00:00:00.000Z';
        expect(west.format(new Date(originalDate))).toBe('12/31/1999');
        vi.spyOn(Date.prototype,'toLocaleDateString').mockImplementation(function(this:Date){return west.format(this);});
        vi.stubGlobal('fetch',vi.fn(async(url:string)=>ok(url.endsWith('/me')?self:[{...friend,birthday:originalDate},{...friend,id:21,name:'Hidden birthday friend'}])));
        render(view());
        const chinese=locale==='zh-TW';
        const query=screen.getByRole('textbox',{name:chinese?'姓名、手機號碼或電子信箱':'Name, phone number, or email'});
        fireEvent.change(query,{target:{value:'original'}});
        fireEvent.click(screen.getByRole('button',{name:chinese?'搜尋使用者':'Search Users'}));
        await screen.findByText((chinese?'生日: ':'Birthday: ')+'2000-01-01');
        expect(screen.queryByText(/12\/31\/1999/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button',{name:chinese?'追蹤中':'Following',exact:true}));
        await screen.findByText((chinese?'生日: ':'Birthday: ')+'2000-01-01');
        expect(screen.getAllByText(/2000-01-01/)).toHaveLength(1);
        expect(screen.queryByText(/12\/31\/1999/)).not.toBeInTheDocument();
    });
    it('successful cards retain hidden contacts and non-nested labelled profile/wish links',async()=>{
        vi.stubGlobal('fetch',vi.fn(async(url:string)=>ok(url.endsWith('/me')?self:[friend])));render(view());submit();
        await screen.findByText('合成朋友');expect(screen.getByText('聯絡資料未公開')).toBeInTheDocument();
        const link=screen.getByRole('link',{name:'查看公開資料 · 合成朋友'});expect(link).toHaveAttribute('href','/users/20/profile');expect(link.querySelector('button')).toBeNull();
        expect(screen.getByRole('link',{name:'查看公開願望 · 合成朋友'})).toHaveAttribute('href','/users/20/wishlists');
        expect(screen.getByRole('button',{name:'追蹤 · 合成朋友'})).toHaveClass('min-h-11');
    });
    it('query encoding preserves &,+ and Chinese instead of adding extra API parameters',async()=>{
        const fetcher=vi.fn(async(url:string)=>ok(url.endsWith('/me')?self:[]));vi.stubGlobal('fetch',fetcher);render(view());submit('A&B+中文');
        await screen.findByText('找不到使用者');const url=new URL(fetcher.mock.calls.find(call=>call[0].includes('/search?'))![0]);
        expect([...url.searchParams.keys()]).toEqual(['query']);expect(url.searchParams.get('query')).toBe('A&B+中文');
    });
    it('failed search is unknown, not empty, and retry can produce a confirmed empty result',async()=>{
        let fail=true;vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url.endsWith('/me'))return ok(self);if(fail)throw Error('offline');return ok([]);}));
        render(view());submit();await screen.findByRole('alert');expect(screen.queryByText('找不到使用者')).not.toBeInTheDocument();
        fail=false;fireEvent.click(screen.getByRole('button',{name:'重試搜尋'}));await screen.findByText('找不到使用者');expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    it('malformed social data is not accepted as friends or a no-results response',async()=>{
        vi.stubGlobal('fetch',vi.fn(async(url:string)=>ok(url.endsWith('/me')?self:[{...friend,isFollowing:'false'}])));render(view());submit();await screen.findByRole('alert');
        expect(screen.queryByText('合成朋友')).not.toBeInTheDocument();expect(screen.queryByText('找不到使用者')).not.toBeInTheDocument();
    });
    it('editing or clearing query cancels old results even if the old fetch ignores abort',async()=>{
        let resolve!:(value:unknown)=>void;
        vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/me')?ok(self):new Promise(r=>{resolve=r;})));
        render(view());submit();await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));
        fireEvent.change(input(),{target:{value:'其他'}});await act(async()=>resolve(ok([friend])));
        expect(screen.queryByText('合成朋友')).not.toBeInTheDocument();expect(screen.queryByText('找不到使用者')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button',{name:'清除搜尋'}));expect(input()).toHaveValue('');
    });
    it('late previous-account search cannot leak private result into the new account',async()=>{
        let resolve!:(value:unknown)=>void;
        vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>url.endsWith('/me')?ok((init?.headers as Record<string,string>).Authorization==='Bearer social-fixture'?self:{...self,id:21}):new Promise(r=>{resolve=r;})));
        const mounted=render(view());submit();await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));
        mounted.rerender(view({...auth,user:{id:21,phoneNumber:'other'},token:'other-social'}));await act(async()=>resolve(ok([friend])));
        expect(input()).toHaveValue('');expect(screen.queryByText('合成朋友')).not.toBeInTheDocument();
    });
    it('following load failure is not an empty list or zero, and preserves a real zero quota',async()=>{
        vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url.endsWith('/me'))return ok(self);throw Error('offline');}));render(view());
        fireEvent.click(screen.getByRole('button',{name:'追蹤中'}));await screen.findByRole('alert');
        expect(screen.queryByText('尚未追蹤任何人')).not.toBeInTheDocument();expect(screen.getByText('— / 0')).toBeInTheDocument();
        expect(screen.getByRole('button',{name:'重試讀取追蹤清單'})).toBeInTheDocument();
    });
    it('unknown quota remains unknown rather than the old hardcoded 100',async()=>{
        vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url.endsWith('/me'))throw Error('offline');return ok([]);}));render(view());
        fireEvent.click(screen.getByRole('button',{name:'追蹤中'}));await screen.findByText('尚未取得追蹤上限；不以預設數字代替。');
        await screen.findByText('尚未追蹤任何人');expect(screen.getByText('0 / —')).toBeInTheDocument();
    });
    it('HTTPS photo stays a remote URL instead of being prefixed with the API host',async()=>{
        vi.stubGlobal('fetch',vi.fn(async(url:string)=>ok(url.endsWith('/me')?self:[{...friend,avatarUrl:'https://live.staticflickr.com/synthetic/photo.jpg'}])));render(view());submit();
        const image=await screen.findByRole('img',{name:'合成朋友'});expect(image).toHaveAttribute('src','https://live.staticflickr.com/synthetic/photo.jpg');expect(image).toHaveAttribute('referrerpolicy','no-referrer');
    });
    it('quota read retry validates the account and restores a genuine zero without follow mutations',async()=>{
        let quota:unknown={...self,id:99};
        const fetcher=vi.fn(async(url:string)=>ok(url.endsWith('/me')?quota:[]));vi.stubGlobal('fetch',fetcher);render(view());
        fireEvent.click(screen.getByRole('button',{name:'追蹤中'}));await screen.findByText('尚未取得追蹤上限；不以預設數字代替。');
        expect(screen.getByText('0 / —')).toBeInTheDocument();quota=self;
        fireEvent.click(screen.getByRole('button',{name:'重試讀取追蹤上限'}));await screen.findByText('0 / 0');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/me'))).toHaveLength(2);
        expect(fetcher.mock.calls.some(([url])=>url.endsWith('/follow'))).toBe(false);
    });
    it('unfollow confirmation clearly distinguishes a relationship change from account/listing deletion',async()=>{
        const fetcher=vi.fn(async(url:string)=>ok(url.endsWith('/me')?self:[friend]));vi.stubGlobal('fetch',fetcher);render(view());
        fireEvent.click(screen.getByRole('button',{name:'追蹤中'}));await screen.findByText('合成朋友');
        expect(screen.getByText('單向追蹤')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'取消追蹤 · 合成朋友'}));
        expect(screen.getByText('確定要取消追蹤 合成朋友 嗎？不會刪除對方的帳號或商品。')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button',{name:'取消',exact:true}));
        expect(screen.queryByRole('heading',{name:'取消追蹤'})).not.toBeInTheDocument();expect(screen.getByText('合成朋友')).toBeInTheDocument();
        expect(fetcher.mock.calls.some(([url])=>url.endsWith('/follow'))).toBe(false);
    });
    it('unknown follow ACK reads the original durable receipt, never auto-retries',async()=>{
        let receipt:unknown;
        const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
            if(init?.method==='POST'){receipt=await proof(url,String(init.body));throw Error('lost ACK');}
            if(url.includes('/follow-operations/'))return ok(receipt);
            if(url.includes('/follow-state/'))return ok(state);
            if(url.endsWith('/me'))return ok(self);return ok([friend]);
        });vi.stubGlobal('fetch',fetcher);render(view());submit();await screen.findByText('合成朋友');
        await vi.waitFor(()=>expect(screen.getByRole('button',{name:'追蹤 · 合成朋友'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'追蹤 · 合成朋友'}));await screen.findByText(/原追蹤結果尚未確認/);
        expect(screen.getByRole('button',{name:'追蹤 · 合成朋友'})).toBeDisabled();expect(screen.queryByText('後台回執已確認原追蹤變更完成。')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button',{name:'查核原追蹤回執'}));await screen.findByText('後台回執已確認原追蹤變更完成。');
        expect(screen.getByRole('button',{name:'取消追蹤 · 合成朋友'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'已讀回執，清理本機標記'}));await screen.findByText(/已清理讀過的本機回執標記/);
        expect(screen.getByRole('button',{name:'取消追蹤 · 合成朋友'})).not.toBeDisabled();
        expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);
        const read=fetcher.mock.calls.find(call=>call[0].includes('/follow-operations/')&&!call[1]?.method)!;expect(read[1]).not.toHaveProperty('method');
    });
    it('fast duplicate follow is gated; late ACK does not update a replacement account',async()=>{
        let ack!:(value:unknown)=>void;
        const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
            if(init?.method==='POST')return new Promise(r=>{ack=r;});
            if(url.includes('/follow-state/'))return ok(state);
            if(url.endsWith('/me'))return ok((init?.headers as Record<string,string>).Authorization==='Bearer social-fixture'?self:{...self,id:21});return ok([friend]);
        });vi.stubGlobal('fetch',fetcher);const mounted=render(view());submit();await screen.findByText('合成朋友');
        const button=screen.getByRole('button',{name:'追蹤 · 合成朋友'});await vi.waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);fireEvent.click(button);
        await vi.waitFor(()=>expect(ack).toBeTypeOf('function'));expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);
        mounted.rerender(view({...auth,user:{id:21,phoneNumber:'other'},token:'other-social'}));await act(async()=>ack(ok({message:'Followed successfully'})));
        expect(screen.queryByText('後台回執已確認原追蹤變更完成。')).not.toBeInTheDocument();expect(screen.queryByText('合成朋友')).not.toBeInTheDocument();expect(journals.size).toBe(1);
    });
    it('English keeps readable privacy and failure instructions',async()=>{
        localStorage.setItem('user-locale','en-US');vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url.endsWith('/me'))return ok(self);throw Error('offline');}));render(view());
        fireEvent.change(screen.getByRole('textbox',{name:'Name, phone number, or email'}),{target:{value:'test'}});fireEvent.click(screen.getByRole('button',{name:'Search Users'}));
        await screen.findByText('The request failed; results are unknown, not empty. Please retry.');expect(screen.getByText(/Search public display names/)).toBeInTheDocument();
    });
});
