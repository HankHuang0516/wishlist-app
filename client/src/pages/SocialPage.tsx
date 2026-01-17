
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardContent } from "../components/ui/Card";
import { Search, UserMinus, Users, Eye, Info, X, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

import { API_URL, API_BASE_URL } from '../config';
import { t } from "../utils/localization";

interface User {
    id: number;
    name: string;
    phoneNumber: string;
    nicknames?: string;
    avatarUrl?: string;
    birthday?: string; // New
    isFollowing?: boolean;
    isMutual?: boolean;
}

export default function SocialPage() {
    const { token, user } = useAuth();
    const [activeTab, setActiveTab] = useState<'search' | 'following'>('search');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [followingList, setFollowingList] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setLoading(true);
        setHasSearched(true);
        try {
            const res = await fetch(`${API_URL}/users/search?query=${searchQuery}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSearchResults(data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchFollowing = async () => {
        try {
            const res = await fetch(`${API_URL}/users/following`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setFollowingList(data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const [maxFollowing, setMaxFollowing] = useState(100);

    const fetchSelf = async () => {
        try {
            const res = await fetch(`${API_URL}/users/me`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.maxFollowing) setMaxFollowing(data.maxFollowing);
            }
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        fetchSelf();
    }, []);

    useEffect(() => {
        if (activeTab === 'following') {
            fetchFollowing();
            fetchSelf(); // Refresh limit when tab active
        }
    }, [activeTab]);

    const handleFollow = async (userId: number) => {
        try {
            const res = await fetch(`${API_URL}/users/${userId}/follow`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                // Update local state
                setSearchResults(prev => prev.map(u => u.id === userId ? { ...u, isFollowing: true } : u));
                if (activeTab === 'following') fetchFollowing();
            } else {
                // Determine error reason (e.g. limit reached)
                const err = await res.json();
                alert(`${t('social.unfollowErr')}: ${err.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleUnfollow = async (userId: number) => {
        try {
            const res = await fetch(`${API_URL}/users/${userId}/follow`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setSearchResults(prev => prev.map(u => u.id === userId ? { ...u, isFollowing: false } : u));
                setFollowingList(prev => prev.filter(u => u.id !== userId));
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="container mx-auto p-4 space-y-6 max-w-2xl">
            <h1 className="text-3xl font-bold font-serif text-gray-800">{t('social.title')}</h1>

            <div className="flex space-x-4 border-b">
                <button
                    className={`pb-2 px-4 ${activeTab === 'search' ? 'border-b-2 border-stone-800 font-medium' : 'text-gray-500'}`}
                    onClick={() => setActiveTab('search')}
                >
                    {t('social.findFriends')}
                </button>
                <button
                    className={`pb-2 px-4 ${activeTab === 'following' ? 'border-b-2 border-stone-800 font-medium' : 'text-gray-500'}`}
                    onClick={() => setActiveTab('following')}
                >
                    {t('social.following')}
                </button>
            </div>

            {activeTab === 'search' && (
                <div className="space-y-4">
                    <div className="flex space-x-2">
                        <div className="relative flex-1">
                            <Input
                                placeholder={t('social.searchPlaceholder')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="pr-8" // Make room for X button
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <Button onClick={handleSearch} disabled={loading}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        </Button>
                    </div>

                    <div className="space-y-2">
                        {searchResults.map((user, index) => (
                            <Card key={user.id} className="transition-transform active:scale-95 duration-200">
                                <CardContent className="flex items-center justify-between p-4">
                                    <div className="flex items-center space-x-4">
                                        <div className="w-14 h-14 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                                            {user.avatarUrl ? (
                                                <img src={`${API_BASE_URL}${user.avatarUrl}`} alt={user.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 font-bold">
                                                    {user.name?.[0]?.toUpperCase() || "U"}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-medium text-lg">{user.name || "Unknown"}</p>
                                            <p className="text-xs text-muji-secondary">
                                                {user.nicknames ? `${t('social.nicknamePrefix')}${user.nicknames}` : user.phoneNumber}
                                            </p>
                                            {user.birthday && (
                                                <p className="text-xs text-pink-500 font-medium">
                                                    {t('social.birthdayPrefix')}{new Date(user.birthday).toLocaleDateString()}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-3">
                                        {/* A: Profile Info */}
                                        <Link to={`/users/${user.id}/profile`}>
                                            <Button variant="ghost" size="icon" className="text-blue-600 font-bold hover:bg-blue-50">
                                                <Info className="w-6 h-6 stroke-[3px]" />
                                            </Button>
                                        </Link>

                                        {/* B: View Wishlists */}
                                        <Link to={`/users/${user.id}/wishlists`}>
                                            <Button variant="ghost" size="icon" className="text-stone-600 hover:bg-stone-100">
                                                <Eye className="w-5 h-5" />
                                            </Button>
                                        </Link>

                                        {/* C: Follow/Unfollow */}
                                        {user.isFollowing ? (
                                            <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-50" onClick={() => handleUnfollow(user.id)} title={t('social.unfollow')}>
                                                <UserMinus className="w-5 h-5" />
                                            </Button>
                                        ) : (
                                            <Button variant="ghost" size="icon" className="text-green-600 hover:bg-green-50" onClick={() => handleFollow(user.id)} title={t('social.follow')}>
                                                <Users className="w-5 h-5" /> {/* UserPlus icon requested as 'two small people', Users is close */}
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {searchResults.length === 0 && hasSearched && !loading && (
                            <div className="text-center py-10 bg-gray-50 rounded-lg">
                                <p className="text-gray-400">{t('social.noUsers')}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'following' && (
                <div className="space-y-4">
                    {/* Header Counter */}
                    <div className="flex justify-end text-sm text-gray-500 font-medium">
                        {followingList.length} / {user?.isPremium ? '∞' : maxFollowing}
                    </div>


                    <div className="space-y-3">
                        {followingList.map(user => (
                            <Card key={user.id}>
                                <CardContent className="flex items-center justify-between p-4">
                                    {/* Left: Avatar */}
                                    <div className="flex items-center space-x-4 flex-1">
                                        <div className="w-14 h-14 rounded-full bg-gray-200 overflow-hidden border border-gray-100 flex-shrink-0">
                                            {user.avatarUrl ? (
                                                <img src={`${API_BASE_URL}${user.avatarUrl}`} alt={user.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 font-bold text-xl">
                                                    {user.name?.[0]?.toUpperCase() || "U"}
                                                </div>
                                            )}
                                        </div>

                                        {/* Name & Info */}
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-lg text-gray-900">{user.name}</p>
                                                {user.isMutual ? (
                                                    <span className="text-pink-500 text-xs font-bold bg-pink-50 px-2 py-0.5 rounded-full border border-pink-100">{t('social.mutual')}</span>
                                                ) : (
                                                    <span className="text-gray-400 text-xs font-bold bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">{t('social.peek')}</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muji-secondary">
                                                {user.nicknames ? `${t('social.nicknamePrefix')}${user.nicknames}` : user.phoneNumber}
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
                                        <Link to={`/users/${user.id}/profile`}>
                                            <Button variant="ghost" size="icon" className="text-blue-600 hover:bg-blue-50" title="Profile">
                                                <Info className="w-6 h-6 stroke-[3px]" />
                                            </Button>
                                        </Link>

                                        {/* b. Wishlist */}
                                        <Link to={`/users/${user.id}/wishlists`}>
                                            <Button variant="ghost" size="icon" className="text-stone-600 hover:bg-stone-100" title="Wishlists">
                                                <Eye className="w-6 h-6" />
                                            </Button>
                                        </Link>

                                        {/* c. Remove Friend */}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-500 hover:bg-red-50 hover:text-red-600"
                                            title={t('social.unfollow')}
                                            onClick={() => {
                                                if (confirm(t('social.confirmUnfollow').replace('{name}', user.name))) {
                                                    handleUnfollow(user.id);
                                                }
                                            }}
                                        >
                                            <X className="w-6 h-6 stroke-[3px]" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {followingList.length === 0 && (
                            <div className="text-center py-10 bg-gray-50 rounded-lg">
                                <p className="text-gray-400">{t('social.noFollowing')}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
