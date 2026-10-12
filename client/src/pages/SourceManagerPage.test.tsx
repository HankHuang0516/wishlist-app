import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import SourceManagerPage from './SourceManagerPage';
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);});afterEach(()=>vi.unstubAllGlobals());
const ok=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body});
describe('restricted management UI',()=>{
 it('renders masked dedicated login, clears input and never stores the key',async()=>{
  const storage=vi.spyOn(Storage.prototype,'setItem');const fetch=vi.fn().mockResolvedValueOnce(ok({},401)).mockResolvedValueOnce(ok({expiresAt:'2027-01-10T00:00:00Z',csrfToken:'synthetic-csrf',publishAllowed:false})).mockResolvedValue(ok({items:[],nextCursor:null}));vi.stubGlobal('fetch',fetch);
  render(<MemoryRouter initialEntries={['/manage/login']}><SourceManagerPage/></MemoryRouter>);
  const key=await screen.findByLabelText('管理登入密碼');expect(key).toHaveAttribute('type','password');fireEvent.change(key,{target:{value:'synthetic-only-secret'}});fireEvent.click(screen.getByRole('button',{name:'登入來源草稿管理'}));await screen.findByText(/管理登入期限/);expect(storage).not.toHaveBeenCalled();expect(fetch.mock.calls[1][1].credentials).toBe('same-origin');storage.mockRestore();
 });
 it('normal form has no publish or image-import control and never automatically supplies date or coordinates',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(ok({expiresAt:'2027-01-10T00:00:00Z',csrfToken:'synthetic-csrf',publishAllowed:false})));
  render(<MemoryRouter initialEntries={['/manage/source-items/new']}><SourceManagerPage/></MemoryRouter>);
  expect(await screen.findByLabelText('名稱')).toHaveValue('');expect(screen.getByLabelText('真實公共點緯度')).toHaveValue(null);expect(screen.getByLabelText('實際來源查核 UTC（不自動填今天）')).toHaveValue('');expect(screen.queryByRole('button',{name:/發布/})).toBeNull();expect(screen.getByRole('button',{name:'保存私人待審'})).toBeEnabled();
 });
});
