import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Gift } from 'lucide-react';
import { api } from '../lib/marketplaceApi';
import { parseBirthdayReminders, type BirthdayReminder } from '../lib/birthdayReminders';
import { homeDate, homeText } from '../lib/homeText';
import { socialAvatar } from '../lib/socialWeb';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';

/** Mounted beneath the account/token keyed homepage; never persists social data. */
export default function BirthdayReminders({ token }: { token: string }) {
  const [state, setState] = useState<{ kind: 'loading' | 'failed' | 'ready'; items: BirthdayReminder[] }>({ kind: 'loading', items: [] });
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(true);
  useEffect(() => {
    let active = true; const controller = new AbortController();
    busy.current = true; setState({ kind: 'loading', items: [] });
    void api<unknown>(token, '/users/upcoming-birthdays', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) })
      .then(value => parseBirthdayReminders(value))
      .then(items => { if (active) setState({ kind: 'ready', items }); })
      .catch(() => { if (active) setState({ kind: 'failed', items: [] }); })
      .finally(() => { if (active) busy.current = false; });
    return () => { active = false; controller.abort(); };
  }, [token, attempt]);
  return <Card className="bg-blue-50 border-none shadow-sm h-full">
    <CardHeader className="p-4 pb-1"><CardTitle className="text-xs font-medium text-blue-600">{homeText('birthdays')}</CardTitle></CardHeader>
    <CardContent className="space-y-3 px-4 pb-4 max-h-[300px] overflow-y-auto">
      {state.kind === 'loading' && <p role="status" className="text-xs text-blue-600">{homeText('birthdayLoading')}</p>}
      {state.kind === 'failed' && <div><p role="alert" className="text-sm text-blue-900">{homeText('birthdayFailed')}</p>
        <button type="button" className="mt-2 min-h-11 rounded-md border border-blue-300 bg-white px-3 text-sm text-blue-900" onClick={() => {
          if (busy.current) return; busy.current = true; setState({ kind: 'loading', items: [] }); setAttempt(value => value + 1);
        }}>{homeText('birthdayRetry')}</button></div>}
      {state.kind === 'ready' && !state.items.length && <p className="text-xs text-blue-600">{homeText('birthdayEmpty')}</p>}
      {state.kind === 'ready' && state.items.map(friend => {
        const name = friend.name?.trim() || friend.nicknames?.trim() || homeText('anonymous');
        const photo = socialAvatar(friend.avatarUrl);
        return <div key={friend.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 shadow-sm">
          <div aria-hidden="true" className="h-10 w-10 flex-none overflow-hidden rounded-full border border-gray-100 bg-gray-200">
            {photo ? <img src={photo} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center font-bold text-gray-500">{Array.from(name)[0]}</div>}
          </div>
          <div className="min-w-0 flex-1 basis-24"><p className="break-words text-sm font-bold text-gray-900">{name}</p>
            {friend.nicknames && <p className="break-words text-xs text-gray-600">{friend.nicknames}</p>}
            <p className="mt-1 text-xs font-medium text-pink-600">{homeText('birthdayDate', { date: homeDate(friend.nextBirthday) })}</p>
          </div>
          <div className="ml-auto flex flex-none gap-1">
            <Link to={`/users/${friend.id}/profile`} aria-label={homeText('profile', { name })} className="inline-flex h-11 w-11 items-center justify-center rounded-md text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2"><Info className="h-4 w-4" aria-hidden="true" /></Link>
            <Link to={`/users/${friend.id}/wishlists`} aria-label={homeText('gifts', { name })} className="inline-flex h-11 w-11 items-center justify-center rounded-md text-pink-700 hover:bg-pink-50 focus-visible:outline focus-visible:outline-2"><Gift className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
        </div>;
      })}
    </CardContent>
  </Card>;
}
