import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import SourceEvidenceRegistryPage from './SourceEvidenceRegistryPage';
import {evidenceSha} from '../lib/sourceReferenceRegistryData';
const ok=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body});
beforeEach(()=>vi.stubGlobal('crypto',webcrypto));afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
const session=(allowed=true)=>({scope:allowed?'SOURCE_REFERENCE_EVIDENCE_VERIFIER':'SOURCE_REFERENCE_AUTO_DISPLAY',evidenceRegistrationAllowed:allowed,autoReferenceDisplayAllowed:true,publishAllowed:false,csrfToken:'synthetic-csrf',expiresAt:'2027-01-10T00:00:00Z'});
const manifest=async()=>{const raw='{"actualCheckedAt":"2026-10-12T14:41:39.334Z","items":[]}\n';return JSON.stringify({entries:[{archiveItemId:'SYNTHETIC-1',facts:{title:'合成熱水瓶',canonicalUrl:'https://example.invalid/source/1',checkedAt:'2026-10-12T14:41:39.334Z',evidence:{sourceCheckRef:'source:'+await evidenceSha(raw)}},sourceReceiptJson:raw,coordinateEvidence:null}]});};
describe('normal browser private registry',()=>{
 it('old auto-display session has disabled registration and no key input or registration request',async()=>{
  const fetch=vi.fn().mockResolvedValue(ok(session(false)));vi.stubGlobal('fetch',fetch);render(<MemoryRouter initialEntries={['/manage/source-evidence']}><SourceEvidenceRegistryPage/></MemoryRouter>);
  expect(await screen.findByRole('button',{name:'準備登錄預覽'})).toBeDisabled();expect(screen.getByText(/舊登入不升權/)).toBeTruthy();expect(document.querySelector('input[type=password]')).toBeNull();expect(fetch.mock.calls.every(c=>!c[1]?.method||c[1].method==='GET')).toBe(true);
 });
 it('authorized normal form prepares evidence, submits once with CSRF/cookie and renders truthful HOLD without publishing or exposing keys',async()=>{
  let captured:any;const fetch=vi.fn().mockResolvedValueOnce(ok(session())).mockImplementation(async(_url:string,opts:RequestInit)=>{if(opts.method==='POST')captured={operationId:JSON.parse(String(opts.body)).operationId,state:'RECORDED',publicationActions:0,records:[{archiveItemId:'SYNTHETIC-1',recordId:null,receiptRef:'source:evidence/'+'a'.repeat(64),verified:false,issues:['PUBLIC_COORDINATE_ADMINISTRATIVE_CONFLICT'],issuer:'SOURCE_SESSION_VERIFIER'}]};return ok(captured);});
  const storage=vi.spyOn(Storage.prototype,'setItem');vi.stubGlobal('fetch',fetch);render(<MemoryRouter initialEntries={['/manage/source-evidence']}><SourceEvidenceRegistryPage/></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText('批次材料JSON'),{target:{value:await manifest()}});fireEvent.click(screen.getByRole('button',{name:'準備登錄預覽'}));const send=await screen.findByRole('button',{name:'登錄私人來源證據（不發布）'});fireEvent.click(send);
  expect(await screen.findByText(/行政區與公共點資料衝突/)).toBeTruthy();expect(screen.getByText(/本次發布0件/)).toBeTruthy();expect(storage).not.toHaveBeenCalled();expect(fetch.mock.calls).toHaveLength(3);
  const [url,opts]=fetch.mock.calls[1];expect(url).toBe('/api/source-manager/reference-evidence');expect(opts.credentials).toBe('same-origin');expect((opts.headers as Record<string,string>)['X-CSRF-Token']).toBe('synthetic-csrf');expect(opts.headers).not.toHaveProperty('x-admin-key');expect(screen.getByRole('link',{name:'開啟同來源待審表單'})).toHaveAttribute('href','/manage/source-items/new?archiveItemId=SYNTHETIC-1');
 });
 it('uncertain response freezes input and checks the exact original operation instead of posting again',async()=>{
  let calls=0;const fetch=vi.fn(async(url:string,_opts?:RequestInit)=>{calls++;if(url.endsWith('/session'))return ok(session());throw Error('synthetic-network-failure');});vi.stubGlobal('fetch',fetch);
  render(<MemoryRouter initialEntries={['/manage/source-evidence']}><SourceEvidenceRegistryPage/></MemoryRouter>);fireEvent.change(await screen.findByLabelText('批次材料JSON'),{target:{value:await manifest()}});fireEvent.click(screen.getByRole('button',{name:'準備登錄預覽'}));fireEvent.click(await screen.findByRole('button',{name:'登錄私人來源證據（不發布）'}));
  const check=await screen.findByRole('button',{name:'查核原登錄結果'});await waitFor(()=>expect(check).toBeEnabled());expect(screen.getByLabelText('批次材料JSON')).toBeDisabled();fireEvent.click(check);await waitFor(()=>expect(calls).toBe(3));expect(fetch.mock.calls[2][0]).toMatch(/reference-evidence\/operations\/[a-f0-9-]+$/);expect(fetch.mock.calls[2][1]?.method).toBe('GET');
 });
});
