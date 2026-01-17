import { Link, useLocation } from "react-router-dom";
import { House, Gift, Users, Settings } from "lucide-react";
import { t } from "../utils/localization";

export default function BottomNav() {
    const location = useLocation();
    const isActive = (path: string) => location.pathname === path;

    const navItems = [
        { path: "/", icon: House, label: t('nav.home') },
        { path: "/dashboard", icon: Gift, label: t('nav.dashboard') },
        { path: "/social", icon: Users, label: t('nav.social') },
        { path: "/settings", icon: Settings, label: t('nav.settings') }
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-2 pb-safe z-50 sm:hidden">
            <div className="grid grid-cols-4 h-full">
                {navItems.map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={`flex flex-col items-center justify-center gap-1 ${isActive(item.path) ? "text-muji-primary" : "text-gray-400 hover:text-gray-600"
                            }`}
                    >
                        <div className={`p-1 px-3 rounded-full mb-0.5 transition-colors ${isActive(item.path) ? "bg-muji-primary/10" : "bg-transparent"}`}>
                            <item.icon className={`h-6 w-6 ${isActive(item.path) ? "text-muji-primary stroke-[2.5px]" : "stroke-[1.5px]"}`} />
                        </div>
                        <span className="text-[10px] font-medium leading-none">{item.label}</span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
