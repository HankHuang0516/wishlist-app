
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardContent } from "../components/ui/Card";
import { Search, UserMinus, Users, Eye, Info, X, Loader2 } from "lucide-react";
import ActionConfirmModal from "../components/ActionConfirmModal";
import { Link } from "react-router-dom";

import { api } from '../lib/marketplaceApi';
import { parseSocialUsers, socialAvatar, type SocialUser as User } from '../lib/socialWeb';
import { t } from "../utils/localization";

export default function SocialPage() {
    const { token, user } = useAuth();
    if (!token || !user) return <div className="container mx-auto p-4"><p>{t('social.loginRequired')}</p><Link className="inline-flex min-h-11 items-center text-blue-600 underline" to="/login?next=%2Fsocial">{t('nav.login')}</Link></div>;
    return <SocialSession key={`${user.id}:${token}`} token={token} userId={user.id} />;
}

function SocialSession({ token, userId }: { token: string; userId: number }) {
    const [activeTab, setActiveTab] = useState<'search' | 'following'>('search');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [followingList, setFollowingList] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
    const [searchError, setSearchError] = useState(''), [followingError, setFollowingError] = useState('');
    const [followingLoaded, setFollowingLoaded] = useState(false), [followingLoading, setFollowingLoading] = useState(false);
    const [limit, setLimit] = useState<{max: number; premium: boolean} | null>(null), [limitError, setLimitError] = useState(false);
    const [limitLoading, setLimitLoading] = useState(false);
    const [busy, setBusy] = useState(false), [unknown, setUnknown] = useState<number | null>(null);
    const epoch = useRef(0), busyRef = useRef(false), searchSeq = useRef(0), followingSeq = useRef(0);
    const searchAbort = useRef<AbortController | null>(null), followingAbort = useRef<AbortController | null>(null);
    const limitAbort = useRef<AbortController | null>(null), limitSeq = useRef(0);

    // Modal State
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({
        isOpen: false,
        title: "",
        message: "",
        onConfirm: () => { }
    });

    const handleSearch = async () => {
        const query = searchQuery.trim();
        if (!query || query.length > 100) { setSearchError(t('social.queryInvalid')); return; }
        const generation = epoch.current, sequence = ++searchSeq.current;
        searchAbort.current?.abort(); const abort = new AbortController(); searchAbort.current = abort;
        setLoading(true);
        setHasSearched(false); setSearchError(''); setSearchResults([]);
        try {
            const raw = await api(token, '/users/search?' + new URLSearchParams({query}).toString(), {signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])});
            if (epoch.current === generation && searchSeq.current === sequence) { setSearchResults(parseSocialUsers(raw,'search')); setHasSearched(true); }
        } catch {
            if (epoch.current === generation && searchSeq.current === sequence && !abort.signal.aborted) setSearchError(t('social.readError'));
        } finally {
            if (epoch.current === generation && searchSeq.current === sequence) setLoading(false);
        }
    };

    const fetchFollowing = async () => {
        const generation = epoch.current, sequence = ++followingSeq.current;
        followingAbort.current?.abort(); const abort = new AbortController(); followingAbort.current = abort;
        setFollowingLoading(true); setFollowingLoaded(false); setFollowingError(''); setFollowingList([]);
        try {
            const raw = await api(token,'/users/following',{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])});
            if (epoch.current === generation && followingSeq.current === sequence) { setFollowingList(parseSocialUsers(raw,'following')); setFollowingLoaded(true); }
        } catch { if (epoch.current === generation && followingSeq.current === sequence && !abort.signal.aborted) setFollowingError(t('social.readError')); }
        finally { if (epoch.current === generation && followingSeq.current === sequence) setFollowingLoading(false); }
    };

    const fetchLimit = async () => {
        const generation = epoch.current, sequence = ++limitSeq.current;
        limitAbort.current?.abort(); const abort = new AbortController(); limitAbort.current = abort;
        setLimit(null); setLimitError(false); setLimitLoading(true);
        try {
            const remote = await api<Record<string,unknown>>(token,'/users/me',{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])});
            if (epoch.current !== generation || limitSeq.current !== sequence) return;
            if (remote.id !== userId || typeof remote.isPremium !== 'boolean' || !Number.isSafeInteger(remote.maxFollowing) || Number(remote.maxFollowing) < 0) throw new Error();
            setLimit({max:Number(remote.maxFollowing),premium:remote.isPremium});
        } catch { if (epoch.current === generation && limitSeq.current === sequence && !abort.signal.aborted) setLimitError(true); }
        finally { if (epoch.current === generation && limitSeq.current === sequence) setLimitLoading(false); }
    };

    useEffect(() => {
        ++epoch.current; void fetchLimit();
        return () => { epoch.current++; limitAbort.current?.abort(); searchAbort.current?.abort(); followingAbort.current?.abort(); };
    }, []);

    useEffect(() => {
        if (activeTab === 'following') {
            fetchFollowing();
        }
    }, [activeTab]);

    const handleFollow = async (userId: number) => {
        await changeFollow(userId,true);
    };

    const handleUnfollow = async (userId: number) => {
        await changeFollow(userId,false);
    };
    const changeFollow = async (targetId: number, wanted: boolean) => {
        if (busyRef.current || unknown !== null) return;
        const generation = epoch.current; busyRef.current = true; setBusy(true); setFeedbackMessage('');
        try {
            const result = await api<{message:string}>(token,`/users/${targetId}/follow`,{method:wanted?'POST':'DELETE'});
            if (epoch.current !== generation) return;
            if (result.message !== (wanted ? 'Followed successfully' : 'Unfollowed successfully')) throw new Error();
            setSearchResults(prev => prev.map(u => u.id === targetId ? {...u,isFollowing:wanted} : u));
            if (!wanted) setFollowingList(prev => prev.filter(u => u.id !== targetId));
            setFeedbackMessage(t('social.changeConfirmed'));
        } catch { if (epoch.current === generation) { setUnknown(targetId); setFeedbackMessage(t('social.changeUnknown')); } }
        finally { if (epoch.current === generation) { busyRef.current = false; setBusy(false); } }
    };
    const recoverFollow = async () => {
        if (unknown === null || busyRef.current) return;
        const targetId = unknown, generation = epoch.current; busyRef.current = true; setBusy(true);
        try {
            const remote = await api<{id:number;isFollowing:boolean}>(token,`/users/${targetId}`);
            if (epoch.current !== generation) return;
            if (remote.id !== targetId || typeof remote.isFollowing !== 'boolean') throw new Error();
            setSearchResults(prev => prev.map(u => u.id === targetId ? {...u,isFollowing:remote.isFollowing} : u));
            if (!remote.isFollowing) setFollowingList(prev => prev.filter(u => u.id !== targetId));
            setUnknown(null); setFeedbackMessage(remote.isFollowing ? t('social.currentFollowing') : t('social.currentNotFollowing'));
        } catch { if (epoch.current === generation) setFeedbackMessage(t('social.changeUnknown')); }
        finally { if (epoch.current === generation) { busyRef.current = false; setBusy(false); } }
    };

    return (
        <div className="container mx-auto p-4 space-y-6 max-w-2xl">
            <h1 className="text-3xl font-bold font-serif text-gray-800">{t('social.title')}</h1>

            <div className="flex space-x-4 border-b">
                <button
                    className={`min-h-11 pb-2 px-4 ${activeTab === 'search' ? 'border-b-2 border-stone-800 font-medium' : 'text-gray-500'}`}
                    aria-pressed={activeTab === 'search'}
                    onClick={() => setActiveTab('search')}
                >
                    {t('social.findFriends')}
                </button>
                <button
                    className={`min-h-11 pb-2 px-4 ${activeTab === 'following' ? 'border-b-2 border-stone-800 font-medium' : 'text-gray-500'}`}
                    aria-pressed={activeTab === 'following'}
                    onClick={() => setActiveTab('following')}
                >
                    {t('social.following')}
                </button>
            </div>

            {activeTab === 'search' && (
                <div className="space-y-4">
                    <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex space-x-2">
                        <div className="relative flex-1">
                            <Input
                                aria-label={t('social.searchPlaceholder')}
                                placeholder={t('social.searchPlaceholder')}
                                value={searchQuery}
                                onChange={(e) => { searchSeq.current++; searchAbort.current?.abort(); setSearchQuery(e.target.value); setSearchResults([]); setHasSearched(false); setSearchError(''); setLoading(false); }}
                                maxLength={100}
                                className="pl-10 pr-11"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    aria-label={t('social.clearSearch')}
                                    onClick={() => { searchSeq.current++; searchAbort.current?.abort(); setSearchQuery(''); setSearchResults([]); setHasSearched(false); setSearchError(''); setLoading(false); }}
                                    className="absolute right-0 top-1/2 -translate-y-1/2 min-h-11 min-w-11 flex items-center justify-center text-gray-400 hover:text-gray-600"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        </div>
                        <Button type="submit" className="min-h-11" disabled={loading}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('social.search')}
                        </Button>
                    </form>
                    <p className="text-xs text-gray-500">{t('social.privacyHint')}</p>
                    {loading && <p role="status">{t('social.loading')}</p>}
                    {searchError && <div role="alert"><p>{searchError}</p><Button className="min-h-11 mt-2" onClick={() => void handleSearch()}>{t('social.retrySearch')}</Button></div>}
                    {hasSearched && searchResults.length === 20 && <p role="status" className="text-sm">{t('social.refineSearch')}</p>}
                    {searchResults.length === 0 && hasSearched && !loading && searchQuery && (
                        <div className="text-center text-gray-500 py-8">
                            <p>{t('social.noUsers')}</p>
                        </div>
                    )}

                    <div className="space-y-2">
                        {searchResults.map(user => (
                            <Card key={user.id} className="transition-transform active:scale-95 duration-200">
                                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="w-14 h-14 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                                            {user.avatarUrl ? (
                                                <img src={socialAvatar(user.avatarUrl)} referrerPolicy="no-referrer" alt={user.name ?? t('social.anonymous')} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 font-bold">
                                                    {user.name?.[0]?.toUpperCase() || "U"}
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 break-all">
                                            <p className="font-medium text-lg">{user.name || t('social.anonymous')}</p>
                                            <p className="text-xs text-muji-secondary">
                                                {user.nicknames ? `${t('social.nicknamePrefix')}${user.nicknames}` : user.phoneNumber ?? t('social.contactHidden')}
                                            </p>
                                            {user.birthday && (
                                                <p className="text-xs text-pink-500 font-medium">
                                                    {t('social.birthdayPrefix')}{new Date(user.birthday).toLocaleDateString()}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                        {/* A: Profile Info */}
                                        <Link aria-label={`${t('social.viewProfile')} · ${user.name ?? t('social.anonymous')}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-blue-600 hover:bg-blue-50" to={`/users/${user.id}/profile`}>
                                                <Info className="w-6 h-6 stroke-[3px]" />
                                        </Link>

                                        {/* B: View Wishlists */}
                                        <Link aria-label={`${t('social.viewWishes')} · ${user.name ?? t('social.anonymous')}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-stone-600 hover:bg-stone-100" to={`/users/${user.id}/wishlists`}>
                                                <Eye className="w-5 h-5" />
                                        </Link>

                                        {/* C: Follow/Unfollow */}
                                        {user.isFollowing ? (
                                            <Button aria-label={`${t('social.unfollow')} · ${user.name ?? t('social.anonymous')}`} disabled={busy || unknown !== null} variant="ghost" size="icon" className="min-h-11 min-w-11 text-red-500 hover:bg-red-50" onClick={() => handleUnfollow(user.id)} title={t('social.unfollow')}>
                                                <UserMinus className="w-5 h-5" />
                                            </Button>
                                        ) : (
                                            <Button aria-label={`${t('social.follow')} · ${user.name ?? t('social.anonymous')}`} disabled={busy || unknown !== null} variant="ghost" size="icon" className="min-h-11 min-w-11 text-green-600 hover:bg-green-50" onClick={() => handleFollow(user.id)} title={t('social.follow')}>
                                                <Users className="w-5 h-5" /> {/* UserPlus icon requested as 'two small people', Users is close */}
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}

                    </div>
                </div>
            )}

            {activeTab === 'following' && (
                <div className="space-y-4">
                    {/* Header Counter */}
                    <div className="flex justify-end text-sm text-gray-500 font-medium">
                        {followingLoaded ? followingList.length : '—'} / {limit ? limit.premium ? '∞' : limit.max : '—'}
                    </div>
                    {limitLoading && <p role="status">{t('social.loading')}</p>}
                    {limitError && <div role="alert"><p>{t('social.limitUnknown')}</p><Button className="min-h-11 mt-2" disabled={limitLoading} onClick={() => void fetchLimit()}>{t('social.retryLimit')}</Button></div>}
                    {followingLoading && <p role="status">{t('social.loading')}</p>}
                    {followingError && <div role="alert"><p>{followingError}</p><Button className="min-h-11 mt-2" onClick={() => void fetchFollowing()}>{t('social.retryFollowing')}</Button></div>}


                    <div className="space-y-3">
                        {followingList.map(user => (
                            <Card key={user.id}>
                                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                                    {/* Left: Avatar */}
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="w-14 h-14 rounded-full bg-gray-200 overflow-hidden border border-gray-100 flex-shrink-0">
                                            {user.avatarUrl ? (
                                                <img src={socialAvatar(user.avatarUrl)} referrerPolicy="no-referrer" alt={user.name ?? t('social.anonymous')} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 font-bold text-xl">
                                                    {user.name?.[0]?.toUpperCase() || "U"}
                                                </div>
                                            )}
                                        </div>

                                        {/* Name & Info */}
                                        <div className="flex min-w-0 flex-col break-all">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-medium text-lg text-gray-900">{user.name ?? t('social.anonymous')}</p>
                                                {user.isMutual ? (
                                                    <span className="text-pink-500 text-xs font-bold bg-pink-50 px-2 py-0.5 rounded-full border border-pink-100">{t('social.mutual')}</span>
                                                ) : (
                                                    <span className="text-gray-400 text-xs font-bold bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">{t('social.peek')}</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muji-secondary">
                                                {user.nicknames ? `${t('social.nicknamePrefix')}${user.nicknames}` : user.phoneNumber ?? t('social.contactHidden')}
                                            </p>
                                            {user.birthday && (
                                                <p className="text-xs text-pink-500 font-medium">
                                                    {t('social.birthdayPrefix')}{new Date(user.birthday).toLocaleDateString()}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: Actions (a, b, c) */}
                                    <div className="flex items-center gap-1">
                                        {/* a. Profile Info */}
                                        <Link aria-label={`${t('social.viewProfile')} · ${user.name ?? t('social.anonymous')}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-blue-600 hover:bg-blue-50" to={`/users/${user.id}/profile`}>
                                                <Info className="w-6 h-6 stroke-[3px]" />
                                        </Link>

                                        {/* b. Wishlist */}
                                        <Link aria-label={`${t('social.viewWishes')} · ${user.name ?? t('social.anonymous')}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-stone-600 hover:bg-stone-100" to={`/users/${user.id}/wishlists`}>
                                                <Eye className="w-6 h-6" />
                                        </Link>

                                        {/* c. Remove Friend */}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="min-h-11 min-w-11 text-red-500 hover:bg-red-50 hover:text-red-600"
                                            title={t('social.unfollow')}
                                            aria-label={`${t('social.unfollow')} · ${user.name ?? t('social.anonymous')}`}
                                            disabled={busy || unknown !== null}
                                            onClick={() => {
                                                setConfirmModal({
                                                    isOpen: true,
                                                    title: t('social.unfollow'),
                                                    message: t('social.confirmUnfollow').replace('{name}', user.name ?? t('social.anonymous')),
                                                    onConfirm: () => {
                                                        handleUnfollow(user.id);
                                                        setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                                    }
                                                });
                                            }}
                                        >
                                            <X className="w-6 h-6 stroke-[3px]" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {followingLoaded && followingList.length === 0 && (
                            <div className="text-center py-10 bg-gray-50 rounded-lg">
                                <p className="text-gray-400">{t('social.noFollowing')}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ActionConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={t('common.confirm')}
                cancelText={t('common.cancel')}
                variant="destructive"
                isProcessing={busy}
            />
            {feedbackMessage && <p role="status" aria-live="polite" className="rounded-lg border bg-white p-3 text-sm">{feedbackMessage}</p>}
            {unknown !== null && <Button className="min-h-11" disabled={busy} onClick={() => void recoverFollow()}>{t('social.checkCurrentFollow')}</Button>}

            {/* Feedback Toast */}
        </div >
    );
}
