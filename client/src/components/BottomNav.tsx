import { Link, useLocation } from "react-router-dom";
import { House, Gift, MessageCircle, Settings, Map } from "lucide-react";
import { t } from "../utils/localization";

export default function BottomNav() {
    const location = useLocation();
    const isActive = (path: string) => location.pathname === path;

    const navItems = [
        { path: "/", icon: House, label: t('nav.home') },
        { path: "/wishes", icon: Gift, label: '願望' },
        { path: "/explore", icon: Map, label: '探索' },
        { path: "/chat", icon: MessageCircle, label: '聊天' },
        { path: "/settings", icon: Settings, label: t('nav.settings') }
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-2 pb-safe z-50 sm:hidden">
            <nav aria-label="主要功能" className="grid grid-cols-5 h-full">
                {navItems.map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        aria-current={isActive(item.path) ? 'page' : undefined}
                        className={`flex flex-col items-center justify-center gap-1 ${isActive(item.path) ? "text-muji-primary" : "text-gray-400 hover:text-gray-600"
                            }`}
                    >
                        <div className={`p-1 px-3 rounded-full mb-0.5 transition-all duration-200 ${isActive(item.path) ? "bg-muji-primary/10 w-auto" : "bg-transparent"}`}>
                            <item.icon className={`h-6 w-6 ${isActive(item.path) ? "text-muji-primary stroke-[2.5px]" : "stroke-[1.5px]"}`} />
                        </div>
                        <span className="text-[10px] font-medium leading-none">{item.label}</span>
                    </Link>
                ))}
            </nav>
        </div>
    );
}
