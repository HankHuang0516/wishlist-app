import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { API_URL, API_BASE_URL } from '../config';
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { User, Smartphone, MapPin, Tag, Gift } from "lucide-react";
import { Link } from "react-router-dom"; // Added Link import

interface PublicProfile {
    id: number;
    name: string;
    nicknames: string | null;
    avatarUrl: string | null;
    phoneNumber: string | null;
    realName: string | null;
    address: string | null;
}

export default function FriendProfilePage() {
    const { id } = useParams();
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

    if (loading) return <div className="p-8 text-center">Loading profile...</div>;
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
                        {isHidden ? '已隱藏' : value}
                    </p>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold text-muji-primary">好友資料</h1>

            <Card>
                <CardHeader>
                    <CardTitle>基本資料</CardTitle>
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
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/5 text-xs text-gray-500 font-bold">
                                            隱藏
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderField("姓名", profile.name, User)}
                        {renderField("暱稱", profile.nicknames, Tag)}
                        {renderField("真實姓名", profile.realName, User)}
                        {renderField("手機", profile.phoneNumber, Smartphone)}
                        {renderField("地址", profile.address, MapPin)}
                    </div>

                    <div className="pt-6">
                        <Link to={`/users/${id}/wishlists`} className="block w-full">
                            <button className="w-full bg-muji-primary text-white py-3 rounded-md font-medium hover:bg-stone-800 transition-colors flex items-center justify-center gap-2 shadow-sm">
                                <Gift className="w-5 h-5" />
                                查看願望清單
                            </button>
                        </Link>
                    </div>

                </CardContent >
            </Card >
        </div >
    );
}
