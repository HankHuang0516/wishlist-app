import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_URL, API_BASE_URL } from '../config';
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { User, Smartphone, MapPin, Tag, Gift, UserPlus, UserMinus, EyeOff, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { t } from "../utils/localization";

interface PublicProfile {
    id: number;
    name: string;
    nicknames: string | null;
    avatarUrl: string | null;
    phoneNumber: string | null;
    realName: string | null;
    address: string | null;
    isFollowing?: boolean; // Added
}

export default function FriendProfilePage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();
    const [profile, setProfile] = useState<PublicProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProfile();
    }, [id]);

    const fetchProfile = async () => {
        try {
            const res = await fetch(`${API_URL}/users/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setProfile(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center">{t('common.processing')}</div>;
    if (!profile) return <div className="p-8 text-center">User not found</div>;

    const renderField = (label: string, value: string | null, Icon: any) => {
        const isHidden = value === null;
        return (
            <div className={`flex items-center gap-4 p-4 rounded-lg border ${isHidden ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-muji-border'}`}>
                <div className={`p-2 rounded-full ${isHidden ? 'bg-gray-200' : 'bg-muji-bg'}`}>
                    <Icon className={`w-5 h-5 ${isHidden ? 'text-gray-400' : 'text-muji-primary'}`} />
                </div>
                <div>
                    <p className="text-xs text-muji-secondary font-medium">{label}</p>
                    <p className={`font-medium ${isHidden ? 'text-gray-400 italic' : 'text-muji-primary'}`}>
                        {isHidden ? t('friend.hidden') : value}
                    </p>
                </div>
            </div>
        );
    };

    const handleFollow = async () => {
        try {
            const res = await fetch(`${API_URL}/users/${id}/follow`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setProfile(prev => prev ? { ...prev, isFollowing: true } : null);
            }
        } catch (err) { console.error(err); }
    };

    const handleUnfollow = async () => {
        try {
            const res = await fetch(`${API_URL}/users/${id}/follow`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setProfile(prev => prev ? { ...prev, isFollowing: false } : null);
            }
        } catch (err) { console.error(err); }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 pb-20">
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b mb-6 px-4 py-3 flex items-center shadow-sm">
                <Button variant="ghost" className="p-0 mr-4 h-auto hover:bg-transparent" onClick={() => navigate(-1)}>
                    <ArrowLeft className="w-6 h-6 text-gray-600" />
                </Button>
                <h1 className="text-lg font-bold text-muji-primary">Profile</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t('friend.basicInfo')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Avatar Section */}
                    <div className="flex justify-center mb-8">
                        <div className="w-32 h-32 rounded-full bg-gray-200 overflow-hidden border-4 border-white shadow-sm relative">
                            {profile.avatarUrl ? (
                                <img src={`${API_BASE_URL}${profile.avatarUrl}`} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100">
                                    <User className="w-16 h-16" />
                                    {/* Overlay for hidden explicitly? API returns null if hidden, so we just show default */}
                                    {profile.avatarUrl === null && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100/80 backdrop-blur-sm text-gray-500">
                                            <EyeOff className="w-6 h-6 mb-1 opacity-50" />
                                            <span className="text-[10px] font-bold uppercase tracking-wider">{t('friend.hidden')}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderField(t('settings.displayName'), profile.name, User)}
                        {renderField(t('settings.nickname'), profile.nicknames, Tag)}
                        {renderField(t('settings.realName'), profile.realName, User)}
                        {renderField(t('settings.phone'), profile.phoneNumber, Smartphone)}
                        {renderField(t('settings.address'), profile.address, MapPin)}
                    </div>

                    <div className="pt-6 grid grid-cols-2 gap-3">
                        {/* View Wishlist - Primary Action */}
                        <Link to={`/users/${id}/wishlists`} className="block w-full">
                            <button className="w-full bg-muji-primary text-white py-3 rounded-md font-medium hover:bg-stone-800 transition-colors flex items-center justify-center gap-2 shadow-sm">
                                <Gift className="w-5 h-5" />
                                {t('friend.viewWishlist')}
                            </button>
                        </Link>

                        {/* Follow Button - Secondary Action */}
                        {profile.isFollowing ? (
                            <button
                                onClick={handleUnfollow}
                                className="w-full bg-gray-100 text-gray-600 py-3 rounded-md font-medium hover:bg-red-50 hover:text-red-500 transition-colors flex items-center justify-center gap-2 border border-gray-200"
                            >
                                <UserMinus className="w-5 h-5" />
                                {t('social.unfollow')}
                            </button>
                        ) : (
                            <button
                                onClick={handleFollow}
                                className="w-full bg-white text-pink-500 border border-pink-500 py-3 rounded-md font-medium hover:bg-pink-50 transition-colors flex items-center justify-center gap-2"
                            >
                                <UserPlus className="w-5 h-5" />
                                {t('social.follow')}
                            </button>
                        )}
                    </div>

                </CardContent >
            </Card >
        </div >
    );
}

