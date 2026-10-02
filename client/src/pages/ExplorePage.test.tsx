import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import { makeListing, makeMatch, makeMatchPage, makeWish, makeExternalListing, responseOk } from '../__tests__/fixtures/marketplace';
import type { Bounds } from '../lib/listingSearch';
import ExplorePage from './ExplorePage';

const mapState = vi.hoisted(() => ({ failed: false }));
vi.mock('../components/ExploreMapWeb', () => ({ default: (props: { items: { id: string }[]; frame: unknown; onViewport: (box: Bounds) => void; onCluster: (kind: string, ids: string[]) => void }) => {
  if (mapState.failed) throw new Error('synthetic graphics failure');
  return <div><output data-testid="map-frame">{JSON.stringify(props.frame)}</output><button type="button" onClick={() => props.onViewport([121.5, 25, 121.6, 25.1])}>模擬移動地圖</button><button type="button" onClick={() => props.onCluster('seller', props.items.slice(0, 1).map(item => item.id))}>模擬群聚點擊</button></div>;
} }));
const auth = { user: { id: 19, phoneNumber: 'fixture' }, token: 'fixture', isAuthenticated: true, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() };
const view = (path = '/explore', value = auth) => <MemoryRouter initialEntries={[path]}><AuthContext.Provider value={value}><ExplorePage /></AuthContext.Provider></MemoryRouter>;
let originalLocale: string | null;
beforeEach(() => { mapState.failed = false; originalLocale = localStorage.getItem('user-locale'); localStorage.setItem('user-locale', 'zh-TW'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalLocale === null) localStorage.removeItem('user-locale'); else localStorage.setItem('user-locale', originalLocale);
});

describe('bilingual exploration keeps original filters and verified facts', () => {
  const english = () => localStorage.setItem('user-locale', 'en-US');
  const sellerFetch = (item = makeListing()) => vi.fn(async (url: string) => responseOk(
    url.endsWith(`/listings/${item.id}`) ? item : url.includes('match-wishes') ? { items: [], nextCursor: null }
      : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: null }));
  const noWrites = (fetch: ReturnType<typeof vi.fn>) => expect(fetch.mock.calls.some(call =>
    (call[1] as RequestInit | undefined)?.method && (call[1] as RequestInit).method !== 'GET')).toBe(false);

  it('preserves entered keywords and original enum values across a display-language change, querying only on explicit apply', async () => {
    english(); const item = makeListing('原商品 {title} $& 漫畫'), fetch = sellerFetch(item); vi.stubGlobal('fetch', fetch);
    const mounted = render(view('/explore?q=' + encodeURIComponent('三國演義 & {name}')));
    await screen.findByRole('button', { name: `View item details: ${item.title}` });
    expect(screen.getByLabelText('Item keywords')).toHaveValue('三國演義 & {name}');
    fireEvent.click(screen.getByText('Filters and wish comparison (optional)'));
    fireEvent.change(screen.getByLabelText('Brand (exact match)'), { target: { value: '原品牌 {brand}' } });
    fireEvent.change(screen.getByLabelText('Item category'), { target: { value: 'books' } });
    fireEvent.change(screen.getByLabelText('Item condition'), { target: { value: 'USED' } });
    fireEvent.change(screen.getByLabelText('Delivery method'), { target: { value: 'MEETUP' } });
    expect(screen.getByRole('option', { name: 'Books' })).toHaveValue('books');
    const before = fetch.mock.calls.length;
    localStorage.setItem('user-locale', 'zh-TW'); mounted.rerender(view());
    expect(screen.getByLabelText('商品關鍵字')).toHaveValue('三國演義 & {name}');
    expect(screen.getByLabelText('品牌（精確匹配）')).toHaveValue('原品牌 {brand}');
    expect(screen.getByLabelText('商品分類')).toHaveValue('books');
    expect(fetch.mock.calls).toHaveLength(before);
    fireEvent.click(screen.getByRole('button', { name: '套用條件' }));
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(before));
    const last = new URL(fetch.mock.calls.filter(([url]) => url.includes('/listings?')).at(-1)![0]);
    expect(Object.fromEntries(['q','brand','category','condition','delivery'].map(key => [key,last.searchParams.get(key)])))
      .toEqual({ q:'三國演義 & {name}',brand:'原品牌 {brand}',category:'books',condition:'USED',delivery:'MEETUP' });
    noWrites(fetch);
  });

  it('translates real match reasons and uncertainty while retaining wish text, own preview, score and distance', async () => {
    english(); const item = { ...makeListing(), owner: { id:19, name:'本人' } }, wish = { ...makeWish(814), name:'願望 {name} $&' };
    const match = { ...makeMatch(814,item), budget:'CURRENCY_UNKNOWN', distanceKm:3.2, reasons:[
      { code:'NAME',text:'名稱／品牌包含願望關鍵字：三國、{name}' },
      { code:'BUDGET_UNKNOWN',text:'預算幣別不同，未換算或判定價格符合' },
      { code:'DISTANCE',text:'距離所選約略中心約3.2公里（非精確面交位置）' },
      { code:'RECENTLY_VERIFIED',text:'賣家於近7天確認刊登；不代表平台驗證真偽或交易保障' },
    ] };
    const fetch = vi.fn(async (url:string) => responseOk(url.includes('match-wishes') ? {items:[wish],nextCursor:null}
      : url.includes('external-listings') ? {enabled:false,items:[],nextCursor:null}
        : { items:[match],nextCursor:null,scannedCandidates:1,ordering:'RECENT_CANDIDATES_PAGE_SCORE',notice:'已包含自己刊登的配對預覽；自己的商品不能向自己購買。圖片不直接比對，文字吻合不保證同一型號或真偽。' }));
    vi.stubGlobal('fetch',fetch); render(view('/explore?wish=814'));
    await screen.findByText(/1 in-app items \(including 1 own-listing previews\)/);
    expect(screen.getByText('Comparing wish: 願望 {name} $&')).toBeInTheDocument();
    expect(screen.getByText(/My listing preview/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Match score ${match.score}`))).toHaveTextContent('Approximately 3.2 km');
    const reasons = screen.getByText(/Name or brand includes wish keywords: 三國、\{name\}/);
    expect(reasons).toHaveTextContent('Budget currency differs; no conversion or price match is claimed');
    expect(reasons).toHaveTextContent('not a precise meetup location');
    expect(reasons).toHaveTextContent('not platform authenticity verification or transaction protection');
    expect(screen.getByText(/Includes previews of your own listings, which you cannot buy from yourself. Images/)).toBeInTheDocument();
    expect(new URL(fetch.mock.calls.find(([url]) => url.includes('/listings/matches?'))![0]).searchParams.get('includeOwnPreview')).toBe('1');
    noWrites(fetch);
  });

  it('keeps failed reads distinct from an empty marketplace and recovers only after explicit retry without exposing diagnostics', async () => {
    english(); let failed = true; const item=makeListing(), raw='private provider diagnostic fixture';
    const fetch=vi.fn(async (url:string) => { if(url.includes('match-wishes')) return responseOk({items:[],nextCursor:null});
      if(failed) throw new Error(raw); return responseOk(url.includes('external-listings') ? {enabled:false,items:[],nextCursor:null} : {items:[item],nextCursor:null}); });
    vi.stubGlobal('fetch',fetch); render(view());
    expect(await screen.findAllByRole('alert')).toHaveLength(2);
    expect(screen.getAllByText(/Item data could not be read or verified/)).toHaveLength(2);
    expect(screen.queryByText(raw)).not.toBeInTheDocument();
    expect(screen.queryByText(/No matching items in the current map area/)).not.toBeInTheDocument();
    const before=fetch.mock.calls.length; failed=false;
    fireEvent.click(screen.getByRole('button',{name:'Item list'})); expect(fetch.mock.calls).toHaveLength(before);
    fireEvent.click(screen.getAllByRole('button',{name:'Search again'})[0]);
    await screen.findByRole('button',{name:`View item details: ${item.title}`});
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument()); noWrites(fetch);
  });

  it('translates invalid price and radius feedback before dispatch and leaves the original inputs intact', async () => {
    english(); const wish=makeWish(814), fetch=vi.fn(async (url:string) => responseOk(url.includes('match-wishes') ? {items:[wish],nextCursor:null}
      : url.includes('external-listings') ? {enabled:false,items:[],nextCursor:null} : makeMatchPage([])));
    vi.stubGlobal('fetch',fetch); render(view('/explore?wish=814')); await screen.findByText(/Loaded in this area/);
    fireEvent.click(screen.getByText('Filters and wish comparison (optional)'));
    fireEvent.change(screen.getByLabelText('Minimum price (NT$)'),{target:{value:'500'}});
    fireEvent.change(screen.getByLabelText('Maximum price (NT$)'),{target:{value:'100'}}); const before=fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button',{name:'Apply filters'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('The maximum price cannot be below the minimum price');
    expect(screen.getByLabelText('Minimum price (NT$)')).toHaveValue('500'); expect(fetch.mock.calls).toHaveLength(before);
    fireEvent.change(screen.getByLabelText('Maximum price (NT$)'),{target:{value:'1000'}});
    fireEvent.change(screen.getByLabelText('Maximum distance (km, 0.5–200, optional)'),{target:{value:'0.1'}});
    fireEvent.click(screen.getByRole('button',{name:'Apply filters'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Distance must be between 0.5 and 200 km');
    expect(screen.getByLabelText('Maximum distance (km, 0.5–200, optional)')).toHaveValue('0.1'); expect(fetch.mock.calls).toHaveLength(before);
  });

  it('keeps original authoritative details and report destination while translating every seller control', async () => {
    english(); const item={...makeListing('漫畫 {title} $&'),description:'原說明 {name} $&',status:'RESERVED'},fetch=sellerFetch(item);vi.stubGlobal('fetch',fetch);
    render(view());fireEvent.click(await screen.findByRole('button',{name:`View item details: ${item.title}`}));
    const dialog=await screen.findByRole('dialog',{name:'Item details'}); await within(dialog).findByRole('heading',{name:item.title});
    expect(within(dialog).getByText(item.description)).toBeInTheDocument();expect(within(dialog).getByText('Used · Reserved')).toBeInTheDocument();
    expect(within(dialog).getByText('NT$ 250')).toBeInTheDocument();expect(within(dialog).getByText('Delivery:')).toBeInTheDocument();
    expect(within(dialog).getByText(/Taiwan time/)).toBeInTheDocument();
    expect(within(dialog).getAllByRole('img')).toHaveLength(item.media.length);
    expect(within(dialog).getByRole('link',{name:'Open the shareable item page'})).toHaveAttribute('href',`/listings/${item.id}`);
    expect(await within(dialog).findByRole('button',{name:'Report this item'})).toBeInTheDocument();
    fireEvent.keyDown(dialog,{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetch.mock.calls.filter(([url]) => url.endsWith(`/listings/${item.id}`))).toHaveLength(1);noWrites(fetch);
  });

  it('keeps external source facts and URL separate from in-app contact controls in English', async () => {
    english();const item={...makeExternalListing(),title:'來源 {host} $&'},fetch=vi.fn(async (url:string) => responseOk(url.endsWith(`/external-listings/${item.id}`) ? item
      : url.includes('/external-listings?') ? {enabled:true,items:[item],nextCursor:null} : {items:[],nextCursor:null}));vi.stubGlobal('fetch',fetch);
    render(view());fireEvent.click(await screen.findByRole('button',{name:`View source details: ${item.title}`}));
    const dialog=await screen.findByRole('dialog',{name:'External-source item'});await within(dialog).findByRole('heading',{name:item.title});
    expect(within(dialog).getByText('Source price NT$ 590')).toBeInTheDocument();expect(within(dialog).getByText(/not an in-app seller/)).toBeInTheDocument();
    expect(within(dialog).getByText(/District centre, not the exact item location/)).toHaveTextContent('Taiwan time');
    const source=within(dialog).getByRole('link',{name:`Visit the original website (${item.source.host})`});
    expect(source).toHaveAttribute('href',item.canonicalUrl);expect(source).toHaveAttribute('rel','noopener noreferrer');
    const before=fetch.mock.calls.length,photos=Array.from(dialog.querySelectorAll('img'));
    const thumbnail=photos.find(photo=>photo.getAttribute('src')===item.thumbnailUrl)!,original=photos.find(photo=>photo.getAttribute('src')===item.imageUrl)!;
    expect(photos).toHaveLength(2);expect(original).toHaveAttribute('referrerPolicy','no-referrer');
    fireEvent.load(thumbnail);fireEvent.error(original);
    expect(within(dialog).getByRole('img')).toHaveAccessibleName(item.title+' · Source item photo, showing a thumbnail');
    expect(within(dialog).getByRole('status')).toHaveTextContent('The high-resolution photo could not load. Showing a thumbnail.');
    expect(thumbnail).toHaveClass('opacity-100');expect(source).toHaveAttribute('href',item.canonicalUrl);
    expect(fetch.mock.calls).toHaveLength(before);expect(fetch.mock.calls.filter(([url])=>url.endsWith(`/external-listings/${item.id}`))).toHaveLength(1);
    expect(within(dialog).queryByRole('button',{name:/Contact seller/})).not.toBeInTheDocument();noWrites(fetch);
  });

  it('keeps movement and granted location local until explicit search, using bounded permission-failure copy', async () => {
    english();let success!:PositionCallback,deny!:PositionErrorCallback;
    const locate=vi.fn((ready:PositionCallback,failed:PositionErrorCallback) => {success=ready;deny=failed;});
    vi.stubGlobal('navigator',{language:'en-US',geolocation:{getCurrentPosition:locate}});
    const fetch=sellerFetch();vi.stubGlobal('fetch',fetch);render(view());await screen.findByText(/Loaded in this area/);const before=fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button',{name:'Move to my location'}));
    expect(screen.getByText(/Reading location; it is not sent directly/)).toBeInTheDocument();
    act(() => deny({message:'private location failure'} as GeolocationPositionError));
    expect(screen.getByText(/Location is unavailable or permission was not granted/)).toBeInTheDocument();expect(fetch.mock.calls).toHaveLength(before);
    fireEvent.click(screen.getByRole('button',{name:'Move to my location'}));
    act(() => success({coords:{latitude:25.05,longitude:121.55}} as GeolocationPosition));
    expect(screen.getByText(/Only Search this area runs a query/)).toBeInTheDocument();expect(fetch.mock.calls).toHaveLength(before);
    fireEvent.click(screen.getByRole('button',{name:'Search this area'}));await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(before));noWrites(fetch);
  });

  it('provides an English list fallback after a real component render failure without hiding loaded items', async () => {
    english();mapState.failed=true;vi.spyOn(console,'error').mockImplementation(() => {});
    const item=makeListing(),fetch=sellerFetch(item);vi.stubGlobal('fetch',fetch);render(view());
    await screen.findByRole('button',{name:`View item details: ${item.title}`});
    expect(screen.getByText(/The interactive map is unavailable. Switch to Item list/)).toBeInTheDocument();const before=fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button',{name:'Item list'}));
    expect(screen.getByRole('heading',{name:'Item list'})).toBeInTheDocument();expect(fetch.mock.calls).toHaveLength(before);noWrites(fetch);
  });

  it('falls back to English with inaccessible locale storage while guest access keeps its original return path and makes no private read', () => {
    vi.spyOn(localStorage,'getItem').mockImplementation(() => {throw new Error('blocked locale storage');});
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);render(view('/explore',{...auth,token:null,user:null} as unknown as typeof auth));
    expect(screen.getByRole('heading',{name:'Explore the item map'})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Sign in'})).toHaveAttribute('href','/login?next=%2Fexplore');expect(fetch).not.toHaveBeenCalled();
  });
});
describe('APP-equivalent map and list exploration', () => {
  it('applies the homepage search to the input and actual seller query on first read', async () => {
    const fetch = vi.fn(async () => responseOk({ items: [], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view('/explore?q=' + encodeURIComponent('三國演義 & 漫畫')));
    await waitFor(() => expect(screen.getByLabelText('商品關鍵字')).toHaveValue('三國演義 & 漫畫'));
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes('/listings?') && new URL(url).searchParams.get('q') === '三國演義 & 漫畫')).toBe(true));
  });
  it('requires login before requesting private wishlist matching data', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); render(view('/explore', { ...auth, token: null, user: null } as unknown as typeof auth));
    expect(screen.getByRole('link', { name: '登入' })).toHaveAttribute('href', '/login?next=%2Fexplore'); expect(fetch).not.toHaveBeenCalled();
  });
  it('auto frames a single result and only commits a new viewport on explicit search', async () => {
    const item = makeListing(); const fetch = vi.fn(async (url: string) => responseOk(url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByRole('button', { name: `查看${item.title}商品詳情` });
    await waitFor(() => expect(screen.getByTestId('map-frame')).toHaveTextContent('"kind":"single"'));
    const before = fetch.mock.calls.length; fireEvent.click(screen.getByRole('button', { name: '模擬移動地圖' })); fireEvent.click(screen.getByRole('button', { name: '商品列表' }));
    expect(fetch.mock.calls.length).toBe(before); fireEvent.click(screen.getByRole('button', { name: '搜尋此範圍' }));
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(before));
    const path = fetch.mock.calls.filter(([url]) => url.includes('/listings?')).at(-1)![0];
    expect(new URL(path).searchParams.get('bbox')).toBe('121.5,25,121.6,25.1');
  });
  it('finds a matching comic and labels own preview rather than falsely returning zero', async () => {
    const item = { ...makeListing(), owner: { id: 19, name: '本人' } };
    const fetch = vi.fn(async (url: string) => responseOk(url.includes('match-wishes') ? { items: [makeWish(814)], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : makeMatchPage([makeMatch(814, item)]))); vi.stubGlobal('fetch', fetch);
    render(view('/explore?wish=814')); await screen.findByText(/1 件站內商品（含 1 件自有預覽）/);
    expect(screen.getByText(/我的刊登預覽/)).toBeInTheDocument();
    const url = fetch.mock.calls.find(([url]) => url.includes('/listings/matches?'))![0]; expect(new URL(url).searchParams.get('includeOwnPreview')).toBe('1');
  });
  it('focuses a freshly fetched deep-link product and checks the requested identity', async () => {
    const item = makeListing(); vi.stubGlobal('fetch', vi.fn(async (url: string) => responseOk(url.endsWith(`/listings/${item.id}`) ? item : url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: null })));
    render(view(`/explore?listing=${item.id}`)); await screen.findByRole('button', { name: `查看${item.title}商品詳情` });
    await waitFor(() => expect(screen.getByTestId('map-frame')).toHaveTextContent('"zoom":13'));
  });
  it('shows errors separately, never equates failed queries to an empty marketplace', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { if (url.includes('match-wishes')) return responseOk({ items: [], nextCursor: null }); throw new Error('offline'); }));
    render(view()); const errors = await screen.findAllByRole('alert'); expect(errors.length).toBe(2);
    expect(screen.queryByText(/目前地圖範圍沒有符合/)).not.toBeInTheDocument();
  });
  it('keeps a clicked cluster list scoped to its actual leaves, then can return to all results', async () => {
    const first = makeListing('測試漫画甲'), second = makeListing('測試漫畫乙'); vi.stubGlobal('fetch', vi.fn(async (url: string) => responseOk(url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [first, second], nextCursor: null })));
    render(view()); await screen.findByRole('button', { name: `查看${first.title}商品詳情` }); fireEvent.click(screen.getByRole('button', { name: '模擬群聚點擊' }));
    expect(screen.getByRole('heading', { name: '此群聚的商品' })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: `查看${second.title}商品詳情` })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '顯示全部已載入結果' })); expect(screen.getByRole('button', { name: `查看${second.title}商品詳情` })).toBeInTheDocument();
  });
  it('reloads authoritative details and renders every photo with labelled delivery, price and expiry', async () => {
    const item = makeListing(); const fetch = vi.fn(async (url: string) => responseOk(url.endsWith(`/listings/${item.id}`) ? item : url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); fireEvent.click(await screen.findByRole('button', { name: `查看${item.title}商品詳情` })); const dialog = await screen.findByRole('dialog', { name: '商品詳情' });
    await within(dialog).findByRole('heading', { name: item.title }); expect(within(dialog).getByText('交付：')).toBeInTheDocument(); expect(within(dialog).getByText('失效時間：')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '開啟可分享商品頁' })).toHaveAttribute('href', `/listings/${item.id}`);
    fireEvent.keyDown(dialog, { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetch.mock.calls.filter(([url]) => url.endsWith(`/listings/${item.id}`))).toHaveLength(1);
  });
  it('blocks looping pagination without adding duplicate rows', async () => {
    const item = makeListing(), cursor = item.id; vi.stubGlobal('fetch', vi.fn(async (url: string) => responseOk(url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: cursor })));
    render(view()); fireEvent.click(await screen.findByRole('button', { name: '載入更多站內商品' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('分頁重複'); expect(screen.getAllByRole('button', { name: `查看${item.title}商品詳情` })).toHaveLength(1);
  });
  it('offers reports only for another app seller, and replaces rather than nests the product dialog', async () => {
    const item = makeListing(); const fetch = vi.fn(async (url: string) => responseOk(url.includes('/listing-reports/mine') ? { items: [], nextCursor: null } : url.endsWith(`/listings/${item.id}`) ? item : url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); fireEvent.click(await screen.findByRole('button', { name: `查看${item.title}商品詳情` }));
    fireEvent.click(await screen.findByRole('button', { name: '檢舉此商品' }));
    expect(await screen.findByRole('dialog', { name: `檢舉商品：${item.title}` })).toBeInTheDocument(); expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(fetch.mock.calls.some(call => (call as unknown[])[1] && ((call as unknown[])[1] as RequestInit).method === 'POST')).toBe(false);
  });
  it('routes own-product details to management instead of self-report', async () => {
    const item = { ...makeListing(), owner: { id: 19, name: '本人' } }; vi.stubGlobal('fetch', vi.fn(async (url: string) => responseOk(url.endsWith(`/listings/${item.id}`) ? item : url.includes('match-wishes') ? { items: [], nextCursor: null } : url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [item], nextCursor: null })));
    render(view()); fireEvent.click(await screen.findByRole('button', { name: `查看${item.title}商品詳情` }));
    expect(await screen.findByRole('link', { name: '管理我的商品' })).toHaveAttribute('href', '/my-listings'); expect(screen.queryByRole('button', { name: '檢舉此商品' })).not.toBeInTheDocument();
  });
  it('ignores delayed old-session listings after switching accounts', async () => {
    const item = makeListing(); let resolve!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => url.includes('/listings?') && (init.headers as Record<string, string>).Authorization === 'Bearer fixture'
      ? new Promise(done => { resolve = done; }) : Promise.resolve(responseOk(url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [], nextCursor: null }))));
    const mounted = render(view()); await waitFor(() => expect(resolve).toBeDefined()); mounted.rerender(view('/explore', { ...auth, token: 'next', user: { id: 20, phoneNumber: 'next' } }));
    await screen.findByText(/目前地圖範圍沒有符合/); await act(async () => resolve(responseOk({ items: [item], nextCursor: null })));
    expect(screen.queryByRole('button', { name: `查看${item.title}商品詳情` })).not.toBeInTheDocument();
  });
  it('rejects invalid price bounds before sending a new search', async () => {
    const fetch = vi.fn(async (url: string) => responseOk(url.includes('external-listings') ? { enabled: false, items: [], nextCursor: null } : { items: [], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByText(/目前地圖範圍沒有符合/); fireEvent.click(screen.getByText('過濾與願望交叉比對（選用）'));
    fireEvent.change(screen.getByLabelText('最低售價（NT$）'), { target: { value: '500' } }); fireEvent.change(screen.getByLabelText('最高售價（NT$）'), { target: { value: '100' } });
    const before = fetch.mock.calls.length; fireEvent.click(screen.getByRole('button', { name: '套用條件' })); expect(await screen.findByRole('alert')).toHaveTextContent('最高價不可小於最低價'); expect(fetch.mock.calls.length).toBe(before);
  });
  it('keeps external sources separate from app sellers and links to a freshly verified original website', async () => {
    const item = makeExternalListing(); vi.stubGlobal('fetch', vi.fn(async (url: string) => responseOk(url.endsWith(`/external-listings/${item.id}`) ? item : url.includes('/external-listings?') ? { enabled: true, items: [item], nextCursor: null } : { items: [], nextCursor: null })));
    render(view()); fireEvent.click(await screen.findByRole('button', { name: `查看${item.title}來源詳情` }));
    const dialog = await screen.findByRole('dialog', { name: '外部來源商品' }); await within(dialog).findByRole('heading', { name: item.title });
    expect(within(dialog).getByText('來源售價 NT$ 590')).toBeInTheDocument(); expect(within(dialog).getByText(/非站內賣家/)).toBeInTheDocument();
    const source = within(dialog).getByRole('link', { name: /前往來源網站/ }); expect(source).toHaveAttribute('href', item.canonicalUrl); expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(dialog).queryByRole('button', { name: /聯絡賣家/ })).not.toBeInTheDocument();
  });
});
