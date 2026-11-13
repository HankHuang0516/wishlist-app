import { useEffect,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthField,AuthLink,AuthLinks,AuthMessage,AuthPage,AuthPasswordField,AuthSubmit,AuthSwitch } from '../components/AuthLayout';
import { AuthFlowError,authIssue,authText,registrationPayload,registrationAck,today } from '../lib/authFlowWeb';
import { useAuthRequest } from '../lib/useAuthRequest';
import { t } from '../utils/localization';
import { Analytics } from '../utils/analytics';
import ProductNoticeWeb from '../components/ProductNoticeWeb';

export default function Register() {
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[phoneNumber,setPhone]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[birthday,setBirthday]=useState('');
  const [issue,setIssue]=useState(''),[taken,setTaken]=useState(false),[uncertain,setUncertain]=useState(false),[created,setCreated]=useState<{email:string;sent:boolean}|null>(null);
  const {busy,run}=useAuthRequest(),{isAuthenticated}=useAuth(),navigate=useNavigate();
  useEffect(()=>{if(isAuthenticated)navigate('/dashboard');},[isAuthenticated,navigate]);
  async function submit(event:React.FormEvent) {
    event.preventDefault();if(busy||created||uncertain)return;setIssue('');setTaken(false);
    try {const payload=registrationPayload({name,email,phoneNumber,password,confirmation,birthday});const ack=await run('/register',payload);if(!ack)return;const proof=registrationAck(ack,payload.email);setPassword('');setConfirmation('');setCreated({email:payload.email,sent:proof.sent});Analytics.logSignUp('email');}
    catch(error){setIssue(authIssue(error));setTaken(error instanceof AuthFlowError&&error.code==='exists');const unknown=error instanceof AuthFlowError&&error.uncertain;setUncertain(unknown);if(unknown){setPassword('');setConfirmation('');}}
  }
  return <AuthPage title={created?authText('verifyRegistration'):t('register.title')} subtitle={created||uncertain?undefined:t('register.subtitle')} below={<ProductNoticeWeb disabled={busy}/>}>
    <div className="space-y-4">
      {issue&&<AuthMessage tone="error">{issue}</AuthMessage>}
      {taken&&<div className="flex justify-center"><AuthLink to="/forgot-password">{t('login.forgotPassword')}</AuthLink></div>}
      {uncertain&&<p className="text-sm text-gray-600">{authText('registrationUnknown')}</p>}
      {created?<div role="status" className="space-y-2 text-sm"><p>{authText(created.sent?'registrationSent':'registrationNotSent')}</p><p className="break-all font-medium">{created.email}</p></div>:!uncertain&&<form onSubmit={submit} className="space-y-4">
        <AuthField id="name" label={authText('displayName')} autoComplete="nickname" maxLength={50} required value={name} onChange={event=>setName(event.target.value)} disabled={busy}/>
        <AuthField id="email" label={authText('email')} type="email" autoComplete="email" maxLength={254} required value={email} onChange={event=>setEmail(event.target.value)} disabled={busy}/>
        <AuthField id="phoneNumber" label={t('register.phoneNumberOptional')} type="tel" autoComplete="tel" maxLength={10} value={phoneNumber} onChange={event=>setPhone(event.target.value)} disabled={busy}/>
        <AuthPasswordField id="password" label={t('register.password')} value={password} onChange={setPassword} disabled={busy} hint/>
        <AuthPasswordField id="confirmation" label={authText('confirmPassword')} value={confirmation} onChange={setConfirmation} disabled={busy}/>
        <AuthField id="birthday" label={authText('optionalBirthday')} type="date" max={today()} value={birthday} onChange={event=>setBirthday(event.target.value)} disabled={busy}/>
        <AuthSubmit disabled={busy}>{busy?t('register.creatingAccount'):t('register.createAccount')}</AuthSubmit>
      </form>}
    </div>
    {created?<AuthLinks links={['resend','haveVerify','login']}/>:uncertain?<AuthLinks links={['login','resend']}/>:<AuthSwitch prompt={t('register.hasAccount')} to="/login" label={t('register.signIn')}/>}
  </AuthPage>;
}
