import { Link, useLocation } from "react-router-dom";
import { Gift, MessageCircle, Settings, Map } from "lucide-react";
import { getDisplayLocale } from '../utils/localization';

export default function BottomNav({unreadCount=null}:{unreadCount?:number|null}) {
    const zh=getDisplayLocale().startsWith('zh');
    const location = useLocation();
    const isActive = (path: string) => location.pathname === path;

    const navItems = [
        { path: "/wishes", icon: Gift, label: zh?'願望':'Wishes' },
        { path: "/explore", icon: Map, label: zh?'探索':'Explore' },
        { path: "/chat", icon: MessageCircle, label: zh?'聊天':'Chat' },
        { path: "/settings", icon: Settings, label: zh?'我的':'My' }
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-2 pb-safe z-50 sm:hidden">
            <nav aria-label={zh?'主要功能':'Main navigation'} className="grid grid-cols-4 h-full">
                {navItems.map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        aria-current={isActive(item.path) ? 'page' : undefined}
                        className={`flex min-h-12 flex-col items-center justify-center gap-1 ${isActive(item.path) ? "text-muji-primary" : "text-gray-600 hover:text-gray-800"
                            }`}
                    >
                        <div className={`relative p-1 px-3 rounded-full mb-0.5 transition-all duration-200 ${isActive(item.path) ? "bg-muji-primary/10 w-auto" : "bg-transparent"}`}>
                            <item.icon className={`h-6 w-6 ${isActive(item.path) ? "text-muji-primary stroke-[2.5px]" : "stroke-[1.5px]"}`} />
                            {item.path==='/chat'&&unreadCount!==null&&unreadCount>0&&<span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-700 px-1 text-center text-xs leading-5 text-white" aria-label={(zh?'未讀訊息 ':'Unread messages ')+unreadCount}>{unreadCount>99?'99+':unreadCount}</span>}
                        </div>
                        <span className="text-xs font-medium leading-none">{item.label}</span>
                    </Link>
                ))}
            </nav>
        </div>
    );
}
