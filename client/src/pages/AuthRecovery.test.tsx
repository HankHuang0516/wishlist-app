import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { MemoryRouter,useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { AUTH_SESSION_KEY } from '../lib/authSession';
import { authText } from '../lib/authFlowWeb';
import { t } from '../utils/localization';
import EmailVerification from './EmailVerification';
import ResetPassword from './ResetPassword';
import Register from './Register';
import Login from './Login';
import { EmailRequestPage } from './ForgotPasswordPage';

const nonce='a'.repeat(64), second='b'.repeat(64), password='Synthetic123!';
const login=vi.fn(),refreshUser=vi.fn(async()=>{});
const context={user:null,token:null,login,logout:vi.fn(),refreshUser,isAuthenticated:false};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const verification={message:'confirmed',token:'discard-fixture-token',user:{id:2,phoneNumber:'0999999999'}};
function mount(element:React.ReactNode,route='/verify-email?token='+nonce,extra?:React.ReactNode){return render(<MemoryRouter initialEntries={[route]}><AuthContext.Provider value={context}>{element}{extra}</AuthContext.Provider></MemoryRouter>);}
const submit=()=>fireEvent.submit(document.querySelector('form')!);
function fillPassword(){fireEvent.change(screen.getByLabelText(t('forgot.newPassword')),{target:{value:password}});fireEvent.change(screen.getByLabelText(authText('confirmation')),{target:{value:password}});}
function fillRegister(){for(const [label,value] of [[authText('displayName'),'合成名稱'],[authText('email'),'synthetic@example.invalid'],[t('register.phoneNumber'),'0912345678'],[t('register.password'),password],[authText('confirmation'),password]])fireEvent.change(screen.getByLabelText(label),{target:{value}});}
beforeEach(()=>{localStorage.clear();localStorage.setItem('user-locale','zh-TW');login.mockReset();refreshUser.mockClear();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();localStorage.clear();});

describe('explicit web verification and recovery',()=>{
  it('requires confirmation, submits once and never replaces the current login using a verification JWT',async()=>{
    const fetcher=vi.fn(async()=>response(verification));vi.stubGlobal('fetch',fetcher);localStorage.setItem(AUTH_SESSION_KEY,'synthetic-existing-session');
    mount(<EmailVerification/>);expect(fetcher).not.toHaveBeenCalled();submit();submit();
    await screen.findByRole('status');expect(fetcher).toHaveBeenCalledTimes(1);expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({token:nonce});
    expect(login).not.toHaveBeenCalled();expect(localStorage.getItem(AUTH_SESSION_KEY)).toBe('synthetic-existing-session');expect(screen.queryByLabelText(authText('verifyInput'))).not.toBeInTheDocument();
  });
  it('supports manually pasted service links and rejects another origin without HTTP',async()=>{
    const fetcher=vi.fn(async()=>response(verification));vi.stubGlobal('fetch',fetcher);mount(<EmailVerification/>,'/verify-email');
    fireEvent.change(screen.getByLabelText(authText('verifyInput')),{target:{value:'https://evil.example/verify-email?token='+nonce}});submit();expect(await screen.findByRole('alert')).toHaveTextContent(authText('invalidLink'));expect(fetcher).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(authText('verifyInput')),{target:{value:window.location.origin+'/verify-email?token='+nonce}});submit();await screen.findByRole('status');expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('maps expired verification without leaking server text and allows an explicit new code',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(response({errorCode:'TOKEN_EXPIRED',error:'secret-marker'},400)).mockResolvedValueOnce(response(verification));vi.stubGlobal('fetch',fetcher);mount(<EmailVerification/>);submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(authText('expired'));expect(document.body).not.toHaveTextContent('secret-marker');fireEvent.change(screen.getByLabelText(authText('verifyInput')),{target:{value:second}});submit();await screen.findByRole('status');expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([null,{message:'OK'},'not-an-object'])('does not accept incomplete verification acknowledgement %s',async ack=>{
    const fetcher=vi.fn(async()=>response(ack));vi.stubGlobal('fetch',fetcher);mount(<EmailVerification/>);submit();expect(await screen.findByRole('alert')).toHaveTextContent(authText('invalidResponse'));expect(screen.queryByRole('status')).not.toBeInTheDocument();expect(screen.queryByLabelText(authText('verifyInput'))).not.toBeInTheDocument();expect(fetcher).toHaveBeenCalledTimes(1);expect(login).not.toHaveBeenCalled();
  });
  it('ignores late verification after the URL code changes and does not automatically send the new code',async()=>{
    let finish!:(value:Response)=>void;const fetcher=vi.fn((_url:string,_options:RequestInit)=>new Promise<Response>(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',fetcher);
    function ChangeLink(){const navigate=useNavigate();return <button onClick={()=>navigate('/verify-email?token='+second)}>QA change link</button>;}
    mount(<EmailVerification/>,undefined,<ChangeLink/>);submit();await waitFor(()=>expect(finish).toBeDefined());fireEvent.click(screen.getByRole('button',{name:'QA change link'}));await waitFor(()=>expect(screen.getByLabelText(authText('verifyInput'))).toHaveValue(second));
    await act(async()=>finish(response(verification)));expect(screen.queryByRole('status')).not.toBeInTheDocument();expect(login).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
  });
  it('ignores an acknowledgement after leaving the verification page',async()=>{
    let finish!:(value:Response)=>void;const fetcher=vi.fn((_url:string,_options:RequestInit)=>new Promise<Response>(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',fetcher);const view=mount(<EmailVerification/>);submit();view.unmount();await act(async()=>finish(response(verification)));expect(login).not.toHaveBeenCalled();expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
  });
  it('validates reset confirmation and password policy before dispatch',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);mount(<ResetPassword/>,'/reset-password?token='+nonce);fillPassword();fireEvent.change(screen.getByLabelText(authText('confirmation')),{target:{value:'Different123'}});submit();expect(await screen.findByRole('alert')).toHaveTextContent(authText('mismatch'));expect(fetcher).not.toHaveBeenCalled();expect(screen.getByText(authText('passwordHint'))).toBeVisible();
  });
  it('accepts only full reset evidence, clears password fields and does not auto-login or start a redirect timer',async()=>{
    const fetcher=vi.fn(async()=>response({changed:true,requiresLogin:true,personalApiKeysRevoked:true}));vi.stubGlobal('fetch',fetcher);mount(<ResetPassword/>,'/reset-password?token='+nonce);fillPassword();submit();submit();expect(await screen.findByRole('status')).toHaveTextContent(authText('resetSuccess'));expect(fetcher).toHaveBeenCalledTimes(1);expect(login).not.toHaveBeenCalled();expect(localStorage.getItem(AUTH_SESSION_KEY)).toBeNull();expect(screen.queryByLabelText(t('forgot.newPassword'))).not.toBeInTheDocument();
  });
  it.each(['network','incomplete'])('locks an unconfirmed reset after %s and provides recovery links without replay',async kind=>{
    const fetcher=kind==='network'?vi.fn(async()=>{throw new TypeError('raw-secret-marker');}):vi.fn(async()=>response({message:'OK'}));vi.stubGlobal('fetch',fetcher);mount(<ResetPassword/>,'/reset-password?token='+nonce);fillPassword();submit();await screen.findByRole('alert');expect(screen.queryByRole('status')).not.toBeInTheDocument();expect(screen.queryByLabelText(t('forgot.newPassword'))).not.toBeInTheDocument();expect(screen.getByRole('link',{name:authText('forgot')})).toHaveAttribute('href','/forgot-password');expect(fetcher).toHaveBeenCalledTimes(1);expect(document.body).not.toHaveTextContent('raw-secret-marker');
  });
  it('keeps a rejected reset editable and maps the backend error code',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>response({errorCode:'WEAK_PASSWORD'},400)));mount(<ResetPassword/>,'/reset-password?token='+nonce);fillPassword();submit();expect(await screen.findByRole('alert')).toHaveTextContent(authText('weak'));expect(screen.getByLabelText(t('forgot.newPassword'))).toHaveValue(password);
  });
  it.each(['forgot','resend'] as const)('shows neutral %s email acceptance without exposing server details',async mode=>{
    const fetcher=vi.fn(async()=>response({message:'secret-marker account existence'}));vi.stubGlobal('fetch',fetcher);mount(<EmailRequestPage mode={mode}/>);fireEvent.change(screen.getByLabelText('Email'),{target:{value:'synthetic@example.invalid'}});submit();submit();expect(await screen.findByRole('status')).toHaveTextContent(authText('requestAccepted'));expect(fetcher).toHaveBeenCalledTimes(1);expect(document.body).not.toHaveTextContent('secret-marker');fireEvent.click(screen.getByRole('button',{name:authText('requestAgain')}));expect(screen.getByLabelText('Email')).toHaveValue('synthetic@example.invalid');expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps email form available after a rate rejection and does not call it sent',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>response({errorCode:'INTERNAL_ERROR',error:'secret-marker'},429)));mount(<EmailRequestPage/>);fireEvent.change(screen.getByLabelText('Email'),{target:{value:'synthetic@example.invalid'}});submit();expect(await screen.findByRole('alert')).toHaveTextContent(authText('rate'));expect(screen.queryByRole('status')).not.toBeInTheDocument();expect(screen.getByLabelText('Email')).toBeEnabled();
  });
  it.each([true,false])('confirms account creation but does not login; delivery accepted=%s',async sent=>{
    const fetcher=vi.fn(async()=>response({token:'unverified-fixture',user:{id:1,phoneNumber:'0912345678'},emailVerification:{required:true,sent,sentTo:'synthetic@example.invalid'}},201));vi.stubGlobal('fetch',fetcher);mount(<Register/>,'/register');fillRegister();submit();submit();expect(await screen.findByRole('status')).toHaveTextContent(authText(sent?'registrationSent':'registrationNotSent'));expect(fetcher).toHaveBeenCalledTimes(1);expect(login).not.toHaveBeenCalled();expect(screen.getByRole('link',{name:authText('resend')})).toBeVisible();expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).not.toHaveProperty('birthday');
  });
  it('does not permit blindly repeating registration after an uncertain reply',async()=>{
    const fetcher=vi.fn(async()=>response({message:'OK'},201));vi.stubGlobal('fetch',fetcher);mount(<Register/>,'/register');fillRegister();submit();expect(await screen.findByRole('alert')).toHaveTextContent(authText('invalidResponse'));expect(screen.getByText(authText('registrationUnknown'))).toBeVisible();expect(screen.queryByRole('button',{name:t('register.createAccount')})).not.toBeInTheDocument();expect(fetcher).toHaveBeenCalledTimes(1);expect(login).not.toHaveBeenCalled();
  });
  it('requires a fresh profile for the login identity before admitting a session',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(response({token:'synthetic-session',user:{id:1,phoneNumber:'0912345678'}})).mockResolvedValueOnce(response({id:2,phoneNumber:'0999999999'}));vi.stubGlobal('fetch',fetcher);mount(<Login/>,'/login');fireEvent.change(screen.getByLabelText(t('login.phoneOrEmail')),{target:{value:'synthetic@example.invalid'}});fireEvent.change(screen.getByLabelText(t('login.password')),{target:{value:password}});submit();expect(await screen.findByRole('alert')).toHaveTextContent(authText('invalidResponse'));expect(login).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[1][1]).toMatchObject({cache:'no-store',redirect:'error',headers:{Authorization:'Bearer synthetic-session'}});
  });
  it('uses verification error codes and a shared gate for explicit inline resend',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(response({errorCode:'EMAIL_NOT_VERIFIED',error:'secret-marker'},403)).mockResolvedValueOnce(response({message:'accepted'}));vi.stubGlobal('fetch',fetcher);mount(<Login/>,'/login');fireEvent.change(screen.getByLabelText(t('login.phoneOrEmail')),{target:{value:'synthetic@example.invalid'}});fireEvent.change(screen.getByLabelText(t('login.password')),{target:{value:password}});submit();await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:authText('resend')}));expect(await screen.findByRole('status')).toHaveTextContent(authText('requestAccepted'));expect(fetcher).toHaveBeenCalledTimes(2);expect(login).not.toHaveBeenCalled();expect(document.body).not.toHaveTextContent('secret-marker');
  });
  it('renders complete English recovery labels and rejects a missing code locally',async()=>{
    localStorage.setItem('user-locale','en-US');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);mount(<EmailVerification/>,'/verify-email');expect(screen.getByRole('heading',{name:'Verify email'})).toBeVisible();submit();expect(await screen.findByRole('alert')).toHaveTextContent('Paste a correct link');expect(fetcher).not.toHaveBeenCalled();
  });
});
