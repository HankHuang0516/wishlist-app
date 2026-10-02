import { NavLink } from 'react-router-dom';
import { Gift, House, Map, MessageCircle, Users, Settings } from 'lucide-react';
import { webShellText } from '../lib/webShellCopy';

const entries: { to: string; label: Parameters<typeof webShellText>[0]; description?: Parameters<typeof webShellText>[0]; icon: typeof House }[] = [
  { to: '/', label: 'home', icon: House },
  { to: '/wishes', label: 'gifts', description: 'wishesDescription', icon: Gift },
  { to: '/explore', label: 'explore', description: 'exploreDescription', icon: Map },
  { to: '/chat', label: 'chat', description: 'chatDescription', icon: MessageCircle },
  { to: '/social', label: 'friends', icon: Users },
  { to: '/settings', label: 'settings', icon: Settings },
];

/** One labelled navigation for desktop and narrow web; no duplicate settings icon. */
export default function WebNavigation() {
  return <nav aria-label={webShellText('navigation')} className="flex min-w-0 items-center justify-between gap-1 sm:gap-2">
    {entries.map(({ to, label, description, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'}
      aria-label={webShellText(description ?? label)} title={webShellText(description ?? label)}
      className={({ isActive }) => `flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 rounded-md px-2 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-muji-primary ${isActive ? 'bg-gray-100 text-muji-primary' : 'text-gray-600 hover:bg-gray-50'}`}>
      <Icon className="h-5 w-5" aria-hidden="true" /><span>{webShellText(label)}</span>
    </NavLink>)}
  </nav>;
}
