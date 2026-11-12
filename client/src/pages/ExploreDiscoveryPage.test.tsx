import {act,fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {AuthContext} from '../context/AuthContext';
import ExploreDiscoveryPage from './ExploreDiscoveryPage';
vi.mock('../components/DiscoveryMap',()=>({default:({page,onSearchBounds}:any)=><div data-testid="shared-discovery-map">{page.items.map((p:any)=><span key={p.key}>{p.title}</span>)}<button onClick={()=>onSearchBounds([120,22,121,24])}>查詢合成範圍</button></div>}));
import {ApiFailure} from '../lib/marketplaceApi';
import {isLegacyExplore,readDiscovery} from '../lib/discovery';
import DiscoveryCategoryPicker from '../components/DiscoveryCategoryPicker';
const {publicApi,api}=vi.hoisted(()=>({publicApi:vi.fn(),api:vi.fn()}));
vi.mock('../lib/marketplaceApi',async original=>({...await original<typeof import('../lib/marketplaceApi')>(),publicApi,api}));
const auth={token:'fixture',user:{id:42,phoneNumber:'synthetic'},isAuthenticated:true,login:vi.fn(),logout:vi.fn(),refreshUser:vi.fn()};
const p={kind:'source',id:'ab427730-60af-40c4-b568-37170d93e605',key:'source:ab427730-60af-40c4-b568-37170d93e605',title:'BenQ 合成螢幕',description:'公開來源參考',mainId:'electronics',subId:'monitors',price:1200,priceText:'1200',currency:'TWD',priceUnitVerified:true,photos:[{id:'a',url:'https://example.invalid/a',thumbnailUrl:'https://example.invalid/a'},{id:'b',url:'https://example.invalid/b',thumbnailUrl:'https://example.invalid/b'}],thumbnailUrl:null,county:'臺北市',district:null,condition:'UNKNOWN',stockStatus:'UNKNOWN',canonicalUrl:'https://example.invalid/product',date:'2026-10-24T00:00:00Z',dateBasis:'SOURCE_POST_RANGE',dateEarliest:null};
const categories=[{id:'electronics',label:'3C數位',en:'Electronics',icon:'monitor',count:1,children:[{id:'monitors',label:'電腦螢幕',en:'Monitors',count:1,thumbnailUrl:null}]}];
const page={items:[p],categories,nextCursor:null,snapshot:'fixed',total:1,counts:{listing:0,source:1,external:0},counties:['臺北市'],complete:true,generatedAt:'2026-10-24T00:00:00Z',unknownPriceExcluded:false};
function Location(){return <output data-testid="location">{useLocation().search}</output>;}
function view(path='/explore'){return <MemoryRouter initialEntries={[path]}><AuthContext.Provider value={auth}><ExploreDiscoveryPage/><Location/></AuthContext.Provider></MemoryRouter>;}
beforeEach(()=>{localStorage.clear();localStorage.setItem('user-locale','zh-TW');publicApi.mockReset().mockResolvedValue(page);api.mockReset().mockImplementation(async(_token,path,options)=>path.startsWith('/discovery')?publicApi(path,options):{lists:[],saved:[]});});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();localStorage.clear();});
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
 expect(screen.getAllByRole('link',{name:'原始來源'}).at(-1)).toHaveAttribute('href','https://example.invalid/product');
 expect(screen.getByRole('link',{name:'請 Wishlist AI 代問'})).toHaveAttribute('href','/chat?source='+p.id);
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
 api.mockImplementation(async(_token,path,o)=>path==='/product-wishes'?{lists:[],saved:[]}:o?.method==='POST'?{state:'COMPLETE',evaluated:3}:publicApi(path,o));
 render(view('/explore?feed=cp&main=electronics'));
 await screen.findByRole('button',{name:'核對這批商品的比較依據'});expect(api.mock.calls.some(c=>c[2]?.method==='POST')).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'核對這批商品的比較依據'}));await screen.findByText('已完成 3 件商品的比較，資料不足的商品暫不提供比較。');
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

it('offers the reference-price orders in every feed and asks the server for them, with a note that uncompared items come last',async()=>{
 for(const feed of ['latest','for-you','cp'])for(const sort of ['retail-ratio-asc','retail-ratio-desc','retail-savings-desc']){
  expect(readDiscovery('?feed='+feed+'&sort='+sort).sort).toBe(sort);
 }
 expect(readDiscovery('?sort=retail-ratio').sort).toBe('newest');expect(readDiscovery('?sort=oldest').sort).toBe('newest');
 render(view());await screen.findByText('BenQ 合成螢幕');
 const toolbar=screen.getByRole('combobox',{name:'排序'});
 expect(within(toolbar).getAllByRole('option').map(o=>o.textContent)).toEqual(['最新優先','價格低至高','價格高至低','原價折數低至高','原價折數高至低','比原價省最多']);
 expect(screen.queryByText(/沒有參考原價的商品排在最後/)).not.toBeInTheDocument();
 fireEvent.change(toolbar,{target:{value:'retail-ratio-asc'}});
 await waitFor(()=>expect(publicApi.mock.calls.at(-1)?.[0]).toBe('/discovery?sort=retail-ratio-asc'));
 expect(screen.getByTestId('location').textContent).toBe('?sort=retail-ratio-asc');
 expect(await screen.findByText('已查到參考原價的商品依折數排在前面，沒有參考原價的商品排在最後。')).toBeInTheDocument();
 fireEvent.change(screen.getByRole('combobox',{name:'排序'}),{target:{value:'retail-savings-desc'}});
 await waitFor(()=>expect(publicApi.mock.calls.at(-1)?.[0]).toBe('/discovery?sort=retail-savings-desc'));
 expect(await screen.findByText('已查到參考原價的商品依省下金額排在前面，沒有參考原價的商品排在最後。')).toBeInTheDocument();
 // The filter drawer offers the same orders and keeps the chosen one.
 fireEvent.click(screen.getByRole('button',{name:'篩選商品'}));
 const drawerSort=within(await screen.findByRole('dialog')).getByRole('combobox',{name:'排序'});
 expect(drawerSort).toHaveValue('retail-savings-desc');
 expect(within(drawerSort).getAllByRole('option').map(o=>o.textContent)).toEqual(['最新優先','價格低至高','價格高至低','原價折數低至高','原價折數高至低','比原價省最多']);
});
it('keeps the feed’s own order first and adds the reference-price orders in the comparison feed',async()=>{
 render(view('/explore?feed=cp'));await screen.findByText('BenQ 合成螢幕');
 expect(within(screen.getByRole('combobox',{name:'排序'})).getAllByRole('option').map(o=>o.textContent)).toEqual(['比較結果優先','最新優先','價格低至高','價格高至低','原價折數低至高','原價折數高至低','比原價省最多']);
 fireEvent.change(screen.getByRole('combobox',{name:'排序'}),{target:{value:'retail-ratio-desc'}});
 await waitFor(()=>expect(publicApi.mock.calls.at(-1)?.[0]).toBe('/discovery/cp?sort=retail-ratio-desc'));
});

it('reads the next page by itself when the list end scrolls near, but not after a failed read or on the map',async()=>{
 type Watcher={callback:IntersectionObserverCallback;options?:IntersectionObserverInit;target?:Element;live:boolean};const watchers:Watcher[]=[];
 vi.stubGlobal('IntersectionObserver',class{state:Watcher;constructor(callback:IntersectionObserverCallback,options?:IntersectionObserverInit){this.state={callback,options,live:true};watchers.push(this.state);}observe(target:Element){this.state.target=target;}disconnect(){this.state.live=false;}unobserve(){}takeRecords(){return [];}});
 const near=()=>act(()=>{for(const w of watchers.filter(w=>w.live&&w.target))w.callback([{isIntersecting:true,target:w.target!} as IntersectionObserverEntry],{} as IntersectionObserver);});
 const second={...p,id:'0e3c5a56-6d2f-4a0b-9d9b-6d6f1c2b7a11',key:'source:0e3c5a56-6d2f-4a0b-9d9b-6d6f1c2b7a11',title:'第二商品'},third={...second,id:'7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f',key:'source:7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f',title:'第三商品'};
 // The map keeps its button: it shows one batch of places at a time.
 publicApi.mockResolvedValueOnce({...page,items:[{...p,mapLocation:{coordinates:[120.236,23],precision:'PUBLIC_MEETING_POINT'}}],total:3,counts:{listing:0,source:3,external:0},nextCursor:'m1',mapTotals:{located:1,unmapped:2}});
 const map=render(view('/explore?mode=map'));await screen.findByTestId('shared-discovery-map');await screen.findByRole('button',{name:'探索更多商品'});
 expect(watchers.some(w=>w.live&&w.target)).toBe(false);map.unmount();
 publicApi.mockResolvedValueOnce({...page,total:3,nextCursor:'c1'}).mockResolvedValueOnce({...page,items:[second],total:3,nextCursor:'c2'}).mockRejectedValueOnce(Error()).mockResolvedValue({...page,items:[third],total:3,nextCursor:null});
 render(view());await screen.findByText('BenQ 合成螢幕');
 await waitFor(()=>expect(watchers.filter(w=>w.live)[0]?.options?.rootMargin).toBe('0px 0px 600px 0px'));
 expect(watchers.filter(w=>w.live).every(w=>w.target?.classList.contains('discovery-load-more'))).toBe(true);
 await near();await screen.findByText('第二商品');
 expect(publicApi.mock.calls.at(-1)?.[0]).toContain('cursor=c1');
 // The third read fails: the list keeps what it has and waits for the visitor instead of reading again by itself.
 await near();await screen.findByRole('alert');const calls=publicApi.mock.calls.length;
 await near();await near();expect(publicApi.mock.calls.length).toBe(calls);
 fireEvent.click(screen.getByRole('button',{name:'探索更多商品'}));await screen.findByText('第三商品');
 expect(screen.queryByRole('button',{name:'探索更多商品'})).not.toBeInTheDocument();
 vi.unstubAllGlobals();
});
it('in the filter drawer, counts the high-value picks of each category and on the apply button',async()=>{
 const cpCategories=[{...categories[0],count:5,children:[{...categories[0].children[0],count:2}]}];
 publicApi.mockImplementation(async(path:string)=>path.startsWith('/discovery/cp')?{...page,categories:cpCategories,total:path.includes('limit=1')?5:1}:page);
 render(view());await screen.findByText('BenQ 合成螢幕');
 fireEvent.click(screen.getByRole('button',{name:'篩選商品'}));const dialog=await screen.findByRole('dialog');
 expect(within(dialog).getByRole('button',{name:'套用條件'})).toBeInTheDocument();
 // Choosing 高CP激推 reads that feed once, without a category, and every list and the button follow the drawer's choice.
 fireEvent.change(within(dialog).getByRole('combobox',{name:'瀏覽內容'}),{target:{value:'cp'}});
 expect(await within(dialog).findByRole('button',{name:'套用條件（5 件）'})).toBeInTheDocument();
 expect(publicApi.mock.calls.filter(c=>c[0].startsWith('/discovery/cp')).map(c=>c[0])).toEqual(['/discovery/cp?sort=cp&limit=1']);
 expect(within(within(dialog).getByRole('combobox',{name:'主分類'})).getByRole('option',{name:'3C數位（5）'})).toBeInTheDocument();
 fireEvent.change(within(dialog).getByRole('combobox',{name:'主分類'}),{target:{value:'electronics'}});
 fireEvent.change(within(dialog).getByRole('combobox',{name:'子分類'}),{target:{value:'monitors'}});
 expect(within(within(dialog).getByRole('combobox',{name:'子分類'})).getByRole('option',{name:'電腦螢幕（2）'})).toBeInTheDocument();
 expect(within(dialog).getByRole('button',{name:'套用條件（2 件）'})).toBeInTheDocument();
 // Another condition is another scope: the count waits for its own read.
 fireEvent.change(within(dialog).getByRole('combobox',{name:'商品狀況'}),{target:{value:'USED'}});
 expect(within(dialog).getByRole('button',{name:'套用條件'})).toBeInTheDocument();
 await waitFor(()=>expect(publicApi.mock.calls.at(-1)?.[0]).toBe('/discovery/cp?condition=USED&sort=cp&limit=1'));
 expect(await within(dialog).findByRole('button',{name:'套用條件（2 件）'})).toBeInTheDocument();
 // Back to 最新上架: no counts.
 fireEvent.change(within(dialog).getByRole('combobox',{name:'瀏覽內容'}),{target:{value:'latest'}});
 expect(within(dialog).getByRole('button',{name:'套用條件'})).toBeInTheDocument();
 expect(within(within(dialog).getByRole('combobox',{name:'主分類'})).getByRole('option',{name:'3C數位'})).toBeInTheDocument();
});
it('on the high-value feed itself, the loaded page’s counts answer the drawer without another read',async()=>{
 publicApi.mockResolvedValue({...page,categories:[{...categories[0],count:4,children:[{...categories[0].children[0],count:4}]}],total:4});
 render(view('/explore?feed=cp'));await screen.findByText('BenQ 合成螢幕');const reads=publicApi.mock.calls.length;
 fireEvent.click(screen.getByRole('button',{name:'篩選商品'}));const dialog=await screen.findByRole('dialog');
 expect(within(dialog).getByRole('button',{name:'套用條件（4 件）'})).toBeInTheDocument();
 await new Promise(resolve=>setTimeout(resolve,400));expect(publicApi.mock.calls.length).toBe(reads);
 // The budget dialog is not the filter drawer and keeps its plain button.
 fireEvent.click(within(dialog).getByRole('button',{name:'關閉'}));fireEvent.click(screen.getByRole('button',{name:'預算'}));
 expect(within(await screen.findByRole('dialog')).getByRole('button',{name:'套用條件'})).toBeInTheDocument();
});
it('lets a first-time user browse an interest category when no wishes match, without creating a wish',async()=>{
 api.mockImplementation(async(_token,path,options)=>path.startsWith('/discovery/for-you')?{...page,items:[],total:0,counts:{listing:0,source:0,external:0},categories:categories.map(c=>({...c,count:0,children:c.children.map(s=>({...s,count:0}))}))}:path.startsWith('/discovery')?publicApi(path,options):{lists:[],saved:[]});
 render(view('/explore?feed=for-you'));
 await screen.findByText('還沒遇到符合願望的商品');
 fireEvent.click(screen.getByRole('button',{name:'所有分類'}));
 fireEvent.change(screen.getByRole('textbox',{name:'搜尋分類'}),{target:{value:'顯示器'}});
 fireEvent.click(screen.getByRole('button',{name:'3C數位 › 電腦螢幕'}));
 await screen.findByText('BenQ 合成螢幕');
 expect(screen.getByTestId('location')).toHaveTextContent('main=electronics');
 expect(screen.getByTestId('location')).not.toHaveTextContent('feed=for-you');
 expect(api.mock.calls.some(c=>c[2]?.method==='POST')).toBe(false);
});

it('keeps a 429 inside the page, disables repeated retries, then allows one explicit retry',async()=>{
 vi.useFakeTimers();publicApi.mockRejectedValueOnce(new ApiFailure('limited',429,'RATE_LIMIT_EXCEEDED',50));
 await act(async()=>{render(view('/explore?main=electronics'));});
 const button=screen.getByRole('button',{name:/請等候/});expect(button).toBeDisabled();fireEvent.click(button);expect(publicApi).toHaveBeenCalledTimes(1);
 await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
 const retry=screen.getByRole('button',{name:'重新讀取'});await act(async()=>{fireEvent.click(retry);});
 expect(screen.getByText('1 筆公開來源')).toBeInTheDocument();expect(screen.getByTestId('location')).toHaveTextContent('main=electronics');expect(publicApi).toHaveBeenCalledTimes(2);
});

it('shows same-model original-new price and deterministic savings with an attributable source',async()=>{
 const retail={price:4990,priceType:'MANUFACTURER_MSRP',sourceUrl:'https://images.samsung.com/is/content/samsung/assets/tw/downloads/2025-ses-apr-event-guidelines.pdf',sourceTitle:'Synthetic original price',sourcePeriod:'2025-04',checkedAt:'2026-10-24T00:00:00Z'};
 publicApi.mockResolvedValue({...page,items:[{...p,title:'Samsung Galaxy Buds3',price:2500,cp:{score:80,confidence:'MEDIUM',reasons:[],limitations:[],basis:[],model:'synthetic',evaluatedAt:'2026-10-24T00:00:00Z',dimensions:null,retail,conversion:{originalPrice:4990,priceRatio:5,savingsPercent:49.9,pricePoints:20}}}],cpStatus:{evaluated:1,scored:1,pending:0,providerConfigured:true,threshold:75}});
 render(view('/explore?feed=cp'));const badge=await screen.findByText('約參考原價 5 折');expect(screen.getByRole('button',{name:'高CP激推',exact:true})).toHaveAttribute('aria-current','page');expect(screen.getByRole('heading',{name:'高CP激推',exact:true})).toBeVisible();expect(screen.queryByRole('button',{name:'原價比較',exact:true})).not.toBeInTheDocument();expect(screen.queryByText(/AI CP|CP 分數|價差 40/)).not.toBeInTheDocument();expect(screen.queryByText('NT$ 4,990')).not.toBeInTheDocument();
 // The note closes itself in an effect when it first appears. A click that lands before that effect has run is
 // undone by it, which no person can do but a test can: let what the first paint left pending run first.
 await act(async()=>{});
 fireEvent.click(badge);expect(screen.getByText('NT$ 4,990')).toBeVisible();expect(screen.getByRole('link',{name:'原廠建議售價依據'})).toHaveAttribute('href',retail.sourceUrl);expect(api.mock.calls.some(c=>c[2]?.method==='POST')).toBe(false);
});
it.each([['zh-TW','查看 Facebook 原文','請 Wishlist AI 代問'],['en-US','View original Facebook post','Ask Wishlist AI to inquire']])('keeps the exact FB original visible on the card and above photos in %s without starting an inquiry',async(locale,original,inquire)=>{
 localStorage.setItem('user-locale',locale);
 const url='https://www.facebook.com/groups/254672985639737/posts/1775766086863745';
 publicApi.mockResolvedValue({...page,items:[{...p,canonicalUrl:url}]});render(view());
 const cardLink=await screen.findByRole('link',{name:original});expect(cardLink).toHaveAttribute('href',url);expect(cardLink).toHaveAttribute('target','_blank');expect(cardLink).toHaveAttribute('rel','noopener noreferrer');
 fireEvent.click(screen.getByRole('button',{name:locale==='zh-TW'?'查看商品：BenQ 合成螢幕':'View product: BenQ 合成螢幕'}));
 const dialog=await screen.findByRole('dialog');const link=within(dialog).getByRole('link',{name:original});
 expect(link).toHaveAttribute('href',url);expect(link.compareDocumentPosition(within(dialog).getAllByRole('img')[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(within(dialog).getByRole('link',{name:inquire})).toHaveAttribute('href','/chat?source='+p.id);
 expect(api.mock.calls.some(c=>c[2]?.method==='POST')).toBe(false);
 fireEvent.click(within(dialog).getByRole('button',{name:locale==='zh-TW'?'關閉':'Close'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('keeps every shared filter bidirectionally between map and list and searches bounds only on an explicit action',async()=>{
 const mapPage={...page,mapTotals:{located:1,unmapped:0},items:[{...p,mapLocation:{coordinates:[120.236,23],precision:'PUBLIC_MEETING_POINT'}}]};
 publicApi.mockImplementation(async(path:string)=>path.includes('presentation=map')?mapPage:page);
 render(view('/explore?q=BenQ&main=electronics&sub=monitors&county='+encodeURIComponent('臺北市')+'&source=source&condition=UNKNOWN&min=0&max=1500&sort=price-asc&display=list'));
 await screen.findByText('BenQ 合成螢幕');fireEvent.click(screen.getByRole('button',{name:'探索地圖'}));
 await screen.findByTestId('shared-discovery-map');
 let params=new URLSearchParams(publicApi.mock.calls.at(-1)![0].split('?')[1]);
 for(const [key,value]of Object.entries({presentation:'map',q:'BenQ',main:'electronics',sub:'monitors',county:'臺北市',source:'source',condition:'UNKNOWN',min:'0',max:'1500',sort:'price-asc'}))expect(params.get(key)).toBe(value);
 expect(params.has('bbox')).toBe(false);fireEvent.click(screen.getByRole('button',{name:'查詢合成範圍'}));
 await waitFor(()=>expect(publicApi.mock.calls.at(-1)![0]).toContain('bbox=120%2C22%2C121%2C24'));
 fireEvent.click(screen.getByRole('button',{name:'商品列表',exact:true}));await waitFor(()=>expect(screen.queryByTestId('shared-discovery-map')).not.toBeInTheDocument());
 params=new URLSearchParams(publicApi.mock.calls.at(-1)![0].split('?')[1]);
 expect(params.has('presentation')).toBe(false);expect(params.get('condition')).toBe('UNKNOWN');expect(params.get('sub')).toBe('monitors');expect(params.get('max')).toBe('1500');
});
