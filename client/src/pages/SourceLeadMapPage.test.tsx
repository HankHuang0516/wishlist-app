import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SourceLeadMapPage, { mapPoint } from './SourceLeadMapPage';
vi.mock('../context/AuthContext',()=>({useAuth:()=>({token:null})}));
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
describe('source lead public map',()=>{
 it('projects public WGS84 locations inside Taiwan viewport',()=>{for(const [lat,lng] of [[22.998651,120.2362147],[24.9537692,121.2412775]]){const p=mapPoint(lat,lng);expect(p.x).toBeGreaterThan(0);expect(p.x).toBeLessThan(512);expect(p.y).toBeGreaterThan(0);expect(p.y).toBeLessThan(768)}});
 it('reads all pages and shows public facts with login boundary',async()=>{const lead=(id:string)=>({id,title:'來源 '+id,summary:'庫存待確認',canonicalUrl:'https://example.invalid/source/'+id,publicPlaceName:'公開地點',publicAddress:'公共地址',latitude:23,longitude:120.2,stockStatus:'UNKNOWN'});const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({items:[lead('a')],nextCursor:'a'})}).mockResolvedValueOnce({ok:true,json:async()=>({items:[lead('b')],nextCursor:null})});vi.stubGlobal('fetch',fetch);render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await screen.findByText('2 件來源線索・1 個公共地點');expect(fetch).toHaveBeenCalledTimes(2);expect(screen.getByText('登入後詢問')).toBeTruthy();fireEvent.change(screen.getByRole('combobox'),{target:{value:'b'}});expect(screen.getByRole('heading',{name:'來源 b'})).toBeTruthy();expect(screen.queryByRole('button',{name:'保存問題'})).toBeNull();});
 it('reports read failure instead of inventing zero confirmed goods',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));render(<MemoryRouter><SourceLeadMapPage/></MemoryRouter>);await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('來源暫時無法讀取'));expect(screen.queryByText('0 件來源線索・0 個公共地點')).toBeNull();});
});
