import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {AuthContext} from '../context/AuthContext';
import ExploreDiscoveryPage from './ExploreDiscoveryPage';
import {isLegacyExplore,readDiscovery} from '../lib/discovery';
import DiscoveryCategoryPicker from '../components/DiscoveryCategoryPicker';
const {publicApi,api}=vi.hoisted(()=>({publicApi:vi.fn(),api:vi.fn()}));
vi.mock('../lib/marketplaceApi',async original=>({...await original<typeof import('../lib/marketplaceApi')>(),publicApi,api}));
const auth={token:'fixture',user:{id:42,phoneNumber:'synthetic'},isAuthenticated:true,login:vi.fn(),logout:vi.fn(),refreshUser:vi.fn()};
const p={kind:'source',id:'ab427730-60af-40c4-b568-37170d93e605',key:'source:ab427730-60af-40c4-b568-37170d93e605',title:'BenQ 合成螢幕',description:'公開來源參考',mainId:'electronics',subId:'monitors',price:1200,priceText:'1200',currency:'TWD',photos:[{id:'a',url:'https://example.invalid/a',thumbnailUrl:'https://example.invalid/a'},{id:'b',url:'https://example.invalid/b',thumbnailUrl:'https://example.invalid/b'}],thumbnailUrl:null,county:'臺北市',district:null,condition:'UNKNOWN',stockStatus:'UNKNOWN',canonicalUrl:'https://example.invalid/product',date:'2026-10-24T00:00:00Z',dateBasis:'SOURCE_POST_RANGE',dateEarliest:null};
const categories=[{id:'electronics',label:'3C數位',en:'Electronics',icon:'monitor',count:1,children:[{id:'monitors',label:'電腦螢幕',en:'Monitors',count:1,thumbnailUrl:null}]}];
const page={items:[p],categories,nextCursor:null,snapshot:'fixed',total:1,counts:{listing:0,source:1,external:0},counties:['臺北市'],complete:true,generatedAt:'2026-10-24T00:00:00Z',unknownPriceExcluded:false};
function Location(){return <output data-testid="location">{useLocation().search}</output>;}
function view(path='/explore'){return <MemoryRouter initialEntries={[path]}><AuthContext.Provider value={auth}><ExploreDiscoveryPage/><Location/></AuthContext.Provider></MemoryRouter>;}
beforeEach(()=>{localStorage.clear();localStorage.setItem('user-locale','zh-TW');publicApi.mockReset().mockResolvedValue(page);api.mockReset().mockResolvedValue({lists:[],saved:[]});});
afterEach(()=>{vi.restoreAllMocks();localStorage.clear();});
it('applies a subcategory, closes the picker, records recents, and restores URL filters',async()=>{
 render(view('/explore?max=1500&sort=price-asc'));await screen.findByText('BenQ 合成螢幕');
 fireEvent.click(screen.getByRole('button',{name:'所有分類'}));await screen.findByRole('dialog');
 fireEvent.change(screen.getByRole('textbox',{name:'搜尋分類'}),{target:{value:'螢幕'}});
 fireEvent.click(screen.getByRole('button',{name:/3C數位 › 電腦螢幕/}));
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 await waitFor(()=>expect(publicApi.mock.calls.at(-1)?.[0]).toContain('sub=monitors'));
 expect(screen.getByTestId('location').textContent).toContain('max=1500');
 expect(screen.getByTestId('location').textContent).toContain('sort=price-asc');
 expect(screen.getByRole('button',{name:'3C數位 › 電腦螢幕'})).toHaveAttribute('aria-expanded','false');
 fireEvent.click(screen.getByRole('button',{name:'清除分類'}));await waitFor(()=>expect(screen.getByTestId('location').textContent).not.toContain('main='));
});
it('shows positive public counts, original photos and a safe contact route',async()=>{
 render(view());await screen.findByText('1 筆公開來源');expect(screen.queryByText(/0 件站內商品/)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'查看商品：BenQ 合成螢幕'}));const dialog=await screen.findByRole('dialog');expect(dialog).toHaveTextContent('庫存與交易待確認');
 fireEvent.click(screen.getByRole('button',{name:'下一張照片'}));expect(dialog).toHaveTextContent('2 / 2');
 expect(screen.getByRole('link',{name:'查看原始來源'})).toHaveAttribute('href','https://example.invalid/product');
 expect(screen.getByRole('link',{name:'詢問商品'})).toHaveAttribute('href','/chat?source='+p.id);
});
it('rejects a stale response after switching category or account',async()=>{
 let old!:(v:unknown)=>void;publicApi.mockImplementationOnce(()=>new Promise(resolve=>{old=resolve;})).mockResolvedValue(page);
 render(view());fireEvent.change(screen.getByRole('combobox',{name:'地區'}),{target:{value:''}});
 fireEvent.click(screen.getByRole('button',{name:'你會想要'}));api.mockResolvedValue(page);
 await act(async()=>old({...page,items:[{...p,title:'過時商品'}]}));expect(screen.queryByText('過時商品')).not.toBeInTheDocument();
});
it('preserves loaded products on next-page errors and retries without duplicates',async()=>{
 publicApi.mockResolvedValueOnce({...page,nextCursor:'next'}).mockRejectedValueOnce(Error()).mockResolvedValue({...page,items:[p,{...p,id:'second',key:'source:second',title:'第二商品'}]});
 render(view());await screen.findByText('BenQ 合成螢幕');fireEvent.click(screen.getByRole('button',{name:'探索更多商品'}));await screen.findByRole('alert');expect(screen.getByText('BenQ 合成螢幕')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'重試下一頁'}));await screen.findByText('第二商品');expect(screen.getAllByText('BenQ 合成螢幕')).toHaveLength(1);
});
it('reads CP results without triggering AI and evaluates only after an explicit owner action',async()=>{
 publicApi.mockResolvedValue({...page,items:[],total:0,counts:{listing:0,source:0,external:0},cpStatus:{evaluated:0,scored:0,pending:3,providerConfigured:true,threshold:75}});
 api.mockImplementation(async(_token,path)=>path==='/product-wishes'?{lists:[],saved:[]}:{state:'COMPLETE',evaluated:3});
 render(view('/explore?feed=cp&main=electronics'));
 await screen.findByRole('button',{name:'評估這批商品的 CP 值'});expect(api.mock.calls.some(c=>c[2]?.method==='POST')).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'評估這批商品的 CP 值'}));await screen.findByText('已完成 3 件商品的比較，資料不足的商品保留未評分。');
 const post=api.mock.calls.find(c=>c[2]?.method==='POST');expect(post?.[1]).toBe('/discovery/cp-evaluations');expect(JSON.parse(post?.[2].body)).toMatchObject({main:'electronics'});expect(post?.[2].body).not.toMatch(/user|token|wish|display|feed/);
});

it('does not change the submenu when the pointer only crosses another parent on its way to a child',()=>{
 vi.useFakeTimers();
 const home={id:'home',label:'家具家居',en:'Home',icon:'home',count:1,children:[{id:'storage',label:'收納整理',en:'Storage',count:1,thumbnailUrl:null}]};
 render(<DiscoveryCategoryPicker categories={[...categories,home]} main="" sub="" onChange={vi.fn()} storageKey="synthetic-recents"/>);
 fireEvent.click(screen.getByRole('button',{name:'所有分類'}));
 const parent=screen.getByRole('button',{name:'家具家居',exact:true});fireEvent.mouseEnter(parent);fireEvent.mouseLeave(parent);act(()=>vi.advanceTimersByTime(250));
 expect(screen.getByText('電腦螢幕')).toBeInTheDocument();expect(screen.queryByText('收納整理')).not.toBeInTheDocument();
 fireEvent.mouseEnter(parent);act(()=>vi.advanceTimersByTime(250));expect(screen.getByText('收納整理')).toBeInTheDocument();
 vi.useRealTimers();
});

it('preserves legacy filter deep links and restores the new feed sort explicitly',()=>{
 for(const search of ['?brand=Sony','?category=electronics','?minPrice=10','?delivery=SHIPPING','?view=map','?source=11111111-1111-4111-8111-111111111111'])expect(isLegacyExplore(search)).toBe(true);
 expect(isLegacyExplore('?main=electronics&sub=monitors&source=source')).toBe(false);
 expect(readDiscovery('?feed=for-you').sort).toBe('recommended');expect(readDiscovery('?feed=cp').sort).toBe('cp');expect(readDiscovery('?feed=for-you&sort=price-asc').sort).toBe('price-asc');
});
