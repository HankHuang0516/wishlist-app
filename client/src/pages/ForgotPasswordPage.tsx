import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card,CardContent,CardHeader,CardTitle,CardFooter } from '../components/ui/Card';
import { AuthRecoveryLinks } from '../components/AuthRecovery';
import { authIssue,authText,emailPayload,emailRequestAck } from '../lib/authFlowWeb';
import { useAuthRequest } from '../lib/useAuthRequest';

export function EmailRequestPage({mode='forgot'}:{mode?:'forgot'|'resend'}) {
  const [email,setEmail]=useState(''),[issue,setIssue]=useState(''),[accepted,setAccepted]=useState(false);
  const {busy,run}=useAuthRequest(mode);
  async function submit(event:React.FormEvent) {
    event.preventDefault();if(busy)return;setIssue('');
    try {const payload=emailPayload(email);const ack=await run(mode==='forgot'?'/forgot-password':'/resend-verification',payload);if(!ack)return;emailRequestAck(ack);setAccepted(true);}
    catch(error){setIssue(authIssue(error));}
  }
  return <div className="flex items-center justify-center min-h-[60vh] p-4"><Card className="w-full max-w-md">
    <CardHeader><CardTitle className="text-2xl text-center">{authText(mode)}</CardTitle></CardHeader>
    <CardContent className="space-y-4"><p className="text-sm text-muji-secondary">{authText('emailRequest')}</p>
      {issue&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{issue}</p>}
      {accepted?<><p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{authText('requestAccepted')}</p><Button type="button" variant="outline" onClick={()=>{setAccepted(false);setIssue('');}} className="w-full min-h-[44px]">{authText('requestAgain')}</Button></>:<form onSubmit={submit} className="space-y-4">
        <label htmlFor="recovery-email" className="text-sm font-medium">{authText('email')}</label><Input id="recovery-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event=>setEmail(event.target.value)} disabled={busy} className="min-h-[44px]"/>
        <Button type="submit" disabled={busy} className="w-full min-h-[44px]">{authText(busy?'processing':'send')}</Button>
      </form>}
    </CardContent><CardFooter className="block"><AuthRecoveryLinks/></CardFooter>
  </Card></div>;
}
export default function ForgotPasswordPage(){return <EmailRequestPage/>;}
