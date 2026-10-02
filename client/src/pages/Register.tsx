import { useEffect,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card,CardContent,CardHeader,CardTitle,CardFooter } from '../components/ui/Card';
import { AuthPasswordField,AuthRecoveryLinks } from '../components/AuthRecovery';
import { AuthFlowError,authIssue,authText,registrationPayload,registrationAck,today } from '../lib/authFlowWeb';
import { useAuthRequest } from '../lib/useAuthRequest';
import { t } from '../utils/localization';
import { Analytics } from '../utils/analytics';
import ProductNoticeWeb from '../components/ProductNoticeWeb';

export default function Register() {
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[phoneNumber,setPhone]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[birthday,setBirthday]=useState('');
  const [issue,setIssue]=useState(''),[uncertain,setUncertain]=useState(false),[created,setCreated]=useState<{email:string;sent:boolean}|null>(null);
  const {busy,run}=useAuthRequest(),{isAuthenticated}=useAuth(),navigate=useNavigate();
  useEffect(()=>{if(isAuthenticated)navigate('/dashboard');},[isAuthenticated,navigate]);
  async function submit(event:React.FormEvent) {
    event.preventDefault();if(busy||created||uncertain)return;setIssue('');
    try {const payload=registrationPayload({name,email,phoneNumber,password,confirmation,birthday});const ack=await run('/register',payload);if(!ack)return;const proof=registrationAck(ack,payload.email);setPassword('');setConfirmation('');setCreated({email:payload.email,sent:proof.sent});Analytics.logSignUp('email');}
    catch(error){setIssue(authIssue(error));const unknown=error instanceof AuthFlowError&&error.uncertain;setUncertain(unknown);if(unknown){setPassword('');setConfirmation('');}}
  }
  return <div className="flex items-center justify-center min-h-[60vh] p-4"><Card className="w-full max-w-md">
    <CardHeader className="text-center"><CardTitle className="text-2xl">{created?authText('verifyRegistration'):t('register.title')}</CardTitle><p className="text-sm text-muji-secondary">{t('register.subtitle')}</p></CardHeader>
    <CardContent className="space-y-4">
      <ProductNoticeWeb disabled={busy}/>
      {issue&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{issue}</p>}
      {uncertain&&<p className="text-sm text-muji-secondary">{authText('registrationUnknown')}</p>}
      {created?<div role="status" className="space-y-3"><p>{authText(created.sent?'registrationSent':'registrationNotSent')}</p><p className="break-all font-medium">{created.email}</p></div>:!uncertain&&<form onSubmit={submit} className="space-y-4">
        <div className="space-y-2"><label htmlFor="name">{authText('displayName')}</label><Input id="name" autoComplete="nickname" maxLength={50} required value={name} onChange={event=>setName(event.target.value)} disabled={busy} className="min-h-[44px]"/></div>
        <div className="space-y-2"><label htmlFor="email">{authText('email')}</label><Input id="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event=>setEmail(event.target.value)} disabled={busy} className="min-h-[44px]"/></div>
        <div className="space-y-2"><label htmlFor="phoneNumber">{t('register.phoneNumber')}</label><Input id="phoneNumber" type="tel" autoComplete="tel" maxLength={10} required value={phoneNumber} onChange={event=>setPhone(event.target.value)} disabled={busy} className="min-h-[44px]"/></div>
        <AuthPasswordField id="password" label={t('register.password')} value={password} onChange={setPassword} disabled={busy} hint/>
        <AuthPasswordField id="confirmation" label={authText('confirmation')} value={confirmation} onChange={setConfirmation} disabled={busy}/>
        <div className="space-y-2"><label htmlFor="birthday">{authText('optionalBirthday')}</label><Input id="birthday" type="date" max={today()} value={birthday} onChange={event=>setBirthday(event.target.value)} disabled={busy} className="min-h-[44px]"/></div>
        <Button type="submit" disabled={busy} className="w-full min-h-[44px]">{busy?t('register.creatingAccount'):t('register.createAccount')}</Button>
      </form>}
    </CardContent><CardFooter className="block"><AuthRecoveryLinks/></CardFooter>
  </Card></div>;
}
