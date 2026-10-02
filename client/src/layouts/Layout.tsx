import { useState } from 'react';
import { Link, Outlet } from "react-router-dom";
import { Gift, LogOut, CircleHelp, Crown } from "lucide-react";
import { Button } from "../components/ui/Button";
import FeedbackModal from "../components/FeedbackModal";
import WebNavigation from "../components/WebNavigation";
import WebUpdateNotice from '../components/WebUpdateNotice';

import { useAuth } from "../context/AuthContext";
import { webShellText } from '../lib/webShellCopy';

export default function Layout() {
    const { isAuthenticated, logout, user } = useAuth();
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    // Cast user to any to access isPremium until context is updated
    const isPremium = (user as any)?.isPremium;

    return (
        <div className="min-h-screen bg-muji-bg font-sans text-muji-primary flex flex-col">
            {/* Navbar */}
            <header className="sticky top-0 z-50 w-full border-b border-muji-border bg-white/80 backdrop-blur-md">
                <div className="container mx-auto flex min-h-14 flex-wrap items-center justify-between gap-x-4 px-4 py-1">
                    <div className="flex items-center gap-1">
                        <Link to="/" className="flex min-h-11 min-w-11 items-center space-x-2 font-bold text-base tracking-tight text-muji-primary shrink-0">
                            <Gift className="h-5 w-5" />
                            <span>Wishlist.ai</span>
                        </Link>
                        {isAuthenticated && isPremium && (
                            <div title={webShellText('premium')} className="hidden lg:flex items-center gap-1.5 px-3 py-1 ml-2 rounded-full bg-amber-50 border border-amber-200 shadow-sm">
                                <Crown className="w-4 h-4 text-amber-500 fill-amber-500" />
                                <span className="text-xs font-bold text-amber-700">{webShellText('premium')}</span>
                            </div>
                        )}
                        {/* Compact membership badge keeps tablet navigation on one row. */}
                        {isAuthenticated && isPremium && (
                            <div title={webShellText('premium')} className="lg:hidden flex items-center justify-center -mt-1 ml-1 w-6 h-6 rounded-full bg-amber-100 border border-amber-300">
                                <Crown className="w-3 h-3 text-amber-600 fill-amber-600" />
                            </div>
                        )}
                    </div>


                    {isAuthenticated && <div className="order-3 mt-2 w-full border-t border-gray-100 pt-2 sm:order-none sm:ml-auto sm:mt-0 sm:w-auto sm:border-0 sm:pt-0"><WebNavigation /></div>}
                    <div className="flex items-center gap-1">
                        {isAuthenticated ? <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={webShellText('logout')} title={webShellText('logout')} onClick={logout}><LogOut className="h-5 w-5 text-red-500" aria-hidden="true" /></Button>
                            : <Link to="/login" className="inline-flex min-h-11 min-w-11 items-center rounded-md px-3 py-2 text-sm hover:bg-gray-100">{webShellText('login')}</Link>}
                        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={webShellText('help')} onClick={() => setIsFeedbackOpen(true)}><CircleHelp className="h-5 w-5" aria-hidden="true" /></Button>
                    </div>
                </div>
            </header>
            <WebUpdateNotice />

            <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />

            {/* Main Content */}
            <main className="flex-1 container mx-auto px-4 py-6">
                <Outlet />
            </main>

            {/* Footer */}
            <footer className="border-t border-muji-border bg-white py-2">
                <div className="mx-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 text-xs text-muji-secondary xl:grid-cols-[auto_minmax(0,1fr)_auto]">
                        <span className="row-start-2 min-w-0 xl:row-start-1">&copy; {new Date().getFullYear()} Wishlist.ai. Simple & Smart.</span>
                        <div className="col-span-2 col-start-1 row-start-1 flex flex-wrap justify-center gap-x-3 xl:col-span-1 xl:col-start-2">
                            <Link to="/terms" className="inline-flex min-h-11 min-w-11 items-center hover:text-muji-primary transition-colors">{webShellText('terms')}</Link>
                            <Link to="/privacy" className="inline-flex min-h-11 min-w-11 items-center hover:text-muji-primary transition-colors">{webShellText('privacy')}</Link>
                            <Link to="/support" className="inline-flex min-h-11 min-w-11 items-center hover:text-muji-primary transition-colors">{webShellText('support')}</Link>
                            <Link to="/account-deletion" className="inline-flex min-h-11 min-w-11 items-center hover:text-muji-primary transition-colors">{webShellText('deletion')}</Link>
                            <Link to="/partners" className="inline-flex min-h-11 min-w-11 items-center hover:text-muji-primary transition-colors">{webShellText('partners')}</Link>
                            <Link to="/changelog" className="inline-flex min-h-11 min-w-11 items-center hover:text-muji-primary transition-colors">{webShellText('changelog')}</Link>
                            <button onClick={() => setIsFeedbackOpen(true)} className="inline-flex min-h-11 min-w-11 items-center hover:text-muji-primary transition-colors text-left">{webShellText('feedback')}</button>
                        </div>
                    <span className="col-start-2 row-start-2 text-xs text-gray-400 font-mono xl:col-start-3 xl:row-start-1">v{__APP_VERSION__}</span>
                </div>
            </footer>

        </div>
    );
}
