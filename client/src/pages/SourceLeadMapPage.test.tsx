import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import SourceLeadMapPage,{currentLead,mapPoint} from './SourceLeadMapPage';
const auth=vi.hoisted(()=>({token:null as string|null,user:{id:1}}));
vi.mock('../context/AuthContext',()=>({useAuth:()=>auth}));
const dates=()=>({checkedAt:new Date().toISOString(),postedEarliestAt:new Date(Date.now()-86400000).toISOString(),postedLatestAt:new Date(Date.now()-86400000).toISOString()});
const lead=(id='a')=>({...dates(),id,title:'來源 '+id,summary:'待確認',canonicalUrl:'https://example.invalid/source/'+id,county:'臺南市',district:'永康區',publicPlaceName:'公開地點',publicAddress:'公共地址',latitude:23,longitude:120.2,stockStatus:'UNKNOWN'});
afterEach(()=>{auth.token=null;sessionStorage.clear();cleanup();vi.unstubAllGlobals()});
describe('existing card → contact seller → contextual Wishlist AI chat',()=>{
 it('keeps TPE two-month/freshness gate and concrete WGS84 projections',()=>{expect(currentLead(lead())).toBe(true);expect(currentLead({...lead(),checkedAt:new Date(Date.now()-49*3600000).toISOString()})).toBe(false);expect(currentLead({...lead(),postedEarliestAt:new Date(Date.now()-100*86400000).toISOString()})).toBe(false);const p=mapPoint(23,120.2);expect(p.x).toBeGreaterThan(0);expect(p.y).toBeGreaterThan(0);});
 it('reads full pagination and keeps anonymous contact behind login',async()=>{const f=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({items:[lead('a')],nextCursor:'a'})}).mockResolvedValueOnce({ok:true,json:async()=>({items:[lead('b')],nextCursor:null})});vi.stubGlobal('fetch',f);render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByText('2 件來源線索・1 個公共／概略示意位置');expect(screen.getByRole('button',{name:'聯絡賣家'})).toBeTruthy();expect(screen.queryByRole('textbox')).toBeNull();expect(f).toHaveBeenCalledTimes(2);});
 it('read failure never invents zero qualified goods',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByRole('alert');expect(screen.queryByText('0 件來源線索・0 個公共／概略示意位置')).toBeNull();});
});

it('county illustration shows no pickup address, distance or navigation',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({items:[{...lead('county'),county:'桃園市',district:'桃園區',locationPrecision:'COUNTY_ILLUSTRATION',publicPlaceName:'桃園市概略示意位置',publicAddress:'桃園市（概略位置，非取貨點）'}],nextCursor:null})}));render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByText('桃園市（概略位置，非取貨點）');expect(screen.getByText(/概略位置是縣市示意，非取貨點/)).toBeTruthy();expect(screen.queryByRole('link',{name:/導航/})).toBeNull();expect(screen.queryByText(/距離.*公里/)).toBeNull();});
