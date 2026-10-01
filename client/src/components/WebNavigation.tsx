import { NavLink } from 'react-router-dom';
import { Gift, House, Map, MessageCircle, Users, Settings } from 'lucide-react';

const entries = [
  { to: '/', label: '首頁', icon: House },
  { to: '/wishes', label: '禮物', description: '我的願望與照片辨識', icon: Gift },
  { to: '/explore', label: '探索', description: '探索商品地圖', icon: Map },
  { to: '/chat', label: '聊天', description: '聊天與面交', icon: MessageCircle },
  { to: '/social', label: '朋友', icon: Users },
  { to: '/settings', label: '設定', icon: Settings },
];

/** One labelled navigation for desktop and narrow web; no duplicate settings icon. */
export default function WebNavigation() {
  return <nav aria-label="主要功能" className="flex min-w-0 items-center justify-between gap-1 sm:gap-2">
    {entries.map(({ to, label, description, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'}
      aria-label={description ?? label} title={description ?? label}
      className={({ isActive }) => `flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 rounded-md px-2 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-muji-primary ${isActive ? 'bg-gray-100 text-muji-primary' : 'text-gray-600 hover:bg-gray-50'}`}>
      <Icon className="h-5 w-5" aria-hidden="true" /><span>{label}</span>
    </NavLink>)}
  </nav>;
}
