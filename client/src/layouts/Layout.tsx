import { useState } from 'react';
import { Link, Outlet } from "react-router-dom";
import { Gift, House, Users, Settings as SettingsIcon, LogOut, LogIn, CircleHelp, Crown } from "lucide-react";
import { Button } from "../components/ui/Button";
import FeedbackModal from "../components/FeedbackModal";

import { useAuth } from "../context/AuthContext";
import { t } from "../utils/localization";

export default function Layout() {
    const { isAuthenticated, logout, user } = useAuth();
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    // Cast user to any to access isPremium until context is updated
    const isPremium = (user as any)?.isPremium;

    return (
        <div className="min-h-screen bg-muji-bg font-sans text-muji-primary flex flex-col">
            {/* Navbar */}
            <header className="sticky top-0 z-50 w-full border-b border-muji-border bg-white/80 backdrop-blur-md">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-1">
                        <Link to="/" className="flex items-center space-x-2 font-bold text-xl tracking-tight text-muji-primary shrink-0">
                            <Gift className="h-6 w-6" />
                            <span className="hidden sm:inline">Wishlist.ai</span>
                        </Link>
                        {isAuthenticated && isPremium && (
                            <div title="Premium Member" className="hidden sm:flex items-center gap-1.5 px-3 py-1 ml-2 rounded-full bg-amber-50 border border-amber-200 shadow-sm">
                                <Crown className="w-4 h-4 text-amber-500 fill-amber-500" />
                                <span className="text-xs font-bold text-amber-700">尊榮會員</span>
                            </div>
                        )}
                        {/* Mobile view icon only */}
                        {isAuthenticated && isPremium && (
                            <div title="Premium Member" className="sm:hidden flex items-center justify-center -mt-1 ml-1 w-6 h-6 rounded-full bg-amber-100 border border-amber-300">
                                <Crown className="w-3 h-3 text-amber-600 fill-amber-600" />
                            </div>
                        )}
                    </div>


                    {/* Nav Icons */}
                    <div className="flex items-center gap-3 sm:gap-6 md:gap-8 overflow-x-auto no-scrollbar py-2 px-2">
                        <Link to="/">
                            <Button variant="ghost" size="icon" title={t('nav.home')} className="shrink-0">
                                <House className="h-6 w-6" />
                            </Button>
                        </Link>

                        {isAuthenticated && (
                            <>
                                <Link to="/dashboard">
                                    <Button variant="ghost" size="icon" title={t('nav.dashboard')} className="shrink-0 flex items-center justify-center">
                                        <Gift className="h-6 w-6" />
                                    </Button>
                                </Link>
                                <Link to="/social">
                                    <Button variant="ghost" size="icon" title={t('nav.social')} className="shrink-0 flex items-center justify-center">
                                        <Users className="h-6 w-6" />
                                    </Button>
                                </Link>
                                <Link to="/settings">
                                    <Button variant="ghost" size="icon" title={t('nav.settings')} className="shrink-0 flex items-center justify-center">
                                        <SettingsIcon className="h-6 w-6" />
                                    </Button>
                                </Link>
                            </>
                        )}

                        <div className="w-px h-6 bg-gray-200 mx-2 shrink-0"></div>

                        {isAuthenticated ? (
                            <>
                                <Button variant="ghost" size="icon" onClick={logout} title={t('nav.logout')} className="shrink-0 flex items-center justify-center">
                                    <LogOut className="h-6 w-6 text-red-500" />
                                </Button>
                                <Button variant="ghost" size="icon" title="Feedback / Help" className="shrink-0 flex items-center justify-center" onClick={() => setIsFeedbackOpen(true)}>
                                    <CircleHelp className="h-6 w-6" />
                                </Button>
                            </>
                        ) : (
                            <>
                                <Link to="/login">
                                    <Button variant="ghost" size="icon" title={t('nav.login')} className="shrink-0 flex items-center justify-center">
                                        <LogIn className="h-6 w-6" />
                                    </Button>
                                </Link>
                                <Button variant="ghost" size="icon" title="Feedback / Help" className="shrink-0 flex items-center justify-center" onClick={() => setIsFeedbackOpen(true)}>
                                    <CircleHelp className="h-6 w-6" />
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />

            {/* Main Content */}
            <main className="flex-1 container mx-auto px-4 py-8">
                <Outlet />
            </main>

            {/* Footer */}
            <footer className="border-t border-muji-border bg-white py-6">
                <div className="container mx-auto px-4 text-center text-sm text-muji-secondary">
                    &copy; {new Date().getFullYear()} Wishlist.ai. Simple & Smart.
                </div>
            </footer>
        </div>
    );
}
