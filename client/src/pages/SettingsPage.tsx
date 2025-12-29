
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/Card";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Upload, User as UserIcon } from "lucide-react";
import ActionConfirmModal from "../components/ActionConfirmModal";
import PaymentModal from "../components/PaymentModal";
import { API_URL, API_BASE_URL } from '../config';

interface UserProfile {
    id: number;
    name: string; // Used as display name if RealName hidden? Or separate?
    phoneNumber: string;
    realName?: string;
    address?: string;
    nicknames: string; // Stored as comma separated string
    avatarUrl?: string;
    isAvatarVisible: boolean;
    isPhoneVisible: boolean;
    isRealNameVisible: boolean;
    isAddressVisible: boolean;
    birthday?: string; // New
    isBirthdayVisible: boolean; // New
    isPremium: boolean; // New
}

export default function SettingsPage() {
    const { token } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Modal State
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmText?: string;
        variant?: "primary" | "destructive";
        onConfirm: () => void;
        isProcessing?: boolean;
    }>({
        isOpen: false,
        title: "",
        message: "",
        onConfirm: () => { },
        variant: "primary"
    });

    const openModal = (
        title: string,
        message: string,
        onConfirm: () => Promise<void> | void,
        variant: "primary" | "destructive" = "primary",
        confirmTextWithPrice?: string
    ) => {
        setModalConfig({
            isOpen: true,
            title,
            message,
            onConfirm: async () => {
                setModalConfig(prev => ({ ...prev, isProcessing: true })); // Show loading
                await onConfirm();
                setModalConfig(prev => ({ ...prev, isOpen: false, isProcessing: false })); // Close on finish
            },
            variant,
            confirmText: confirmTextWithPrice || "確認 (Confirm)"
        });
    };

    // Payment Modal State
    const [paymentModalConfig, setPaymentModalConfig] = useState<{
        isOpen: boolean;
        amount: number;
        itemName: string;
        extraPayload?: any; // New: to store purchaseType etc.
    }>({
        isOpen: false,
        amount: 0,
        itemName: "",
        extraPayload: {}
    });

    const openPaymentModal = (amount: number, itemName: string, extraPayload?: any) => {
        setPaymentModalConfig({
            isOpen: true,
            amount,
            itemName,
            extraPayload
        });
    };

    const handlePaymentSuccess = (data: any) => {
        alert(`付款成功！交易編號: ${data.transactionId}`);
        window.location.reload();
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            if (!token) return; // Wait for token
            const res = await fetch(`${API_URL}/users/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setProfile(data);
            } else {
                console.error("Failed to fetch profile:", res.status);
                // Redirect if 401/403
                if (res.status === 401 || res.status === 403) {
                    window.location.href = '/login';
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };



    const handleUpdate = async (updatedFields: Partial<UserProfile>) => {
        if (!profile) return;
        const newState = { ...profile, ...updatedFields };
        setProfile(newState); // Optimistic update

        try {
            const res = await fetch(`${API_URL}/users/me`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(updatedFields)
            });
            if (!res.ok) fetchProfile(); // Revert on error
        } catch (error) {
            console.error(error);
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const formData = new FormData();
            formData.append('avatar', file);

            try {
                const res = await fetch(`${API_URL}/users/me/avatar`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                if (res.ok) {
                    const data = await res.json();
                    setProfile(prev => prev ? { ...prev, avatarUrl: data.avatarUrl } : null);
                }
            } catch (error) {
                console.error(error);
            }
        }
    };

    if (loading) return <div className="p-8 text-center">Loading settings...</div>;
    if (!profile) return <div className="p-8 text-center">無法讀取個人資料，請<Link to="/login" className="text-blue-500 underline">重新登入</Link>。</div>;

    const nicknameCount = profile.nicknames ? profile.nicknames.split(',').filter(s => s.trim()).length : 0;

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold text-muji-primary">個人設定</h1>

            {/* Avatar Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>大頭照</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUpdate({ isAvatarVisible: !profile.isAvatarVisible })}
                            title={profile.isAvatarVisible ? "公開顯示" : "隱藏 (顯示預設圖)"}
                        >
                            {profile.isAvatarVisible ? <Eye className="text-green-600" /> : <EyeOff className="text-gray-400" />}
                        </Button>
                    </CardTitle>
                    <CardDescription>
                        {profile.isAvatarVisible
                            ? "目前狀態: 所有人可見 (讓朋友更容易找到你)"
                            : "目前狀態: 隱藏 (別人看到會是預設灰色人)"}
                    </CardDescription>
                    {/* Read-Only Name Display */}
                    <div className="mt-4 p-3 bg-gray-50 rounded-md border border-gray-100 flex flex-col gap-1">
                        <span className="text-xs text-muji-secondary font-medium">姓名 (Login Name)</span>
                        <span className="text-sm text-muji-primary font-semibold">{profile.name}</span>
                    </div>
                </CardHeader>
                <CardContent className="flex items-center gap-6">
                    <div className="w-24 h-24 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 border-2 border-gray-100 relative">
                        {profile.avatarUrl ? (
                            <img src={`${API_BASE_URL}${profile.avatarUrl}`} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                                <UserIcon className="w-12 h-12" />
                            </div>
                        )}
                        {!profile.isAvatarVisible && (
                            <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                                <EyeOff className="text-white drop-shadow-md w-8 h-8" />
                            </div>
                        )}
                    </div>
                    <div>
                        <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                            <Upload className="w-4 h-4 mr-2" />
                            更換照片
                        </Button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            hidden
                            accept="image/*"
                            onChange={handleAvatarUpload}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Nicknames Section - Always Visible */}
            <Card>
                <CardHeader>
                    <CardTitle>暱稱</CardTitle>
                    <CardDescription>
                        (最多5個，預設為 piggy) 越多暱稱使自己更容易被搜尋到。
                        <span className={`ml-2 text-xs ${nicknameCount > 5 ? 'text-red-500' : 'text-gray-400'}`}>
                            {nicknameCount}/5
                        </span>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Input
                        value={profile.nicknames || ""}
                        onChange={(e) => {
                            const val = e.target.value;
                            // Update local state first for typing
                            setProfile({ ...profile, nicknames: val });
                        }}
                        onBlur={(e) => {
                            // Save on blur
                            handleUpdate({ nicknames: e.target.value });
                        }}
                        placeholder="例如: piggy, 小豬, 佩琪 (用逗號分隔)"
                    />
                    <p className="text-xs text-muji-secondary mt-2">請使用逗號分隔多個暱稱。持續顯示，不可隱藏。</p>
                </CardContent>
            </Card>

            {/* Private Info Section */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold mt-8 mb-4">隱私資料 (禮物送到家專用)</h2>

                {/* Real Name */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-end justify-between gap-4">
                            <div className="flex-1 space-y-2">
                                <label className="text-sm font-medium">真實姓名</label>
                                <Input
                                    value={profile.realName || ""}
                                    onChange={(e) => setProfile({ ...profile, realName: e.target.value })}
                                    onBlur={(e) => handleUpdate({ realName: e.target.value })}
                                    placeholder="輸入真實姓名"
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdate({ isRealNameVisible: !profile.isRealNameVisible })}
                                title={profile.isRealNameVisible ? "公開" : "隱藏"}
                            >
                                {profile.isRealNameVisible ? <Eye className="text-green-600" /> : <EyeOff className="text-gray-400" />}
                            </Button>
                        </div>
                        <p className="text-xs text-muji-secondary mt-2">
                            {profile.isRealNameVisible ? "目前: 公開顯示" : "目前: 隱藏 (僅用於送禮)"}
                        </p>
                    </CardContent>
                </Card>

                {/* Address */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-end justify-between gap-4">
                            <div className="flex-1 space-y-2">
                                <label className="text-sm font-medium">寄送地址</label>
                                <Input
                                    value={profile.address || ""}
                                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                                    onBlur={(e) => handleUpdate({ address: e.target.value })}
                                    placeholder="輸入地址"
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdate({ isAddressVisible: !profile.isAddressVisible })}
                            >
                                {profile.isAddressVisible ? <Eye className="text-green-600" /> : <EyeOff className="text-gray-400" />}
                            </Button>
                        </div>
                        <p className="text-xs text-muji-secondary mt-2">
                            {profile.isAddressVisible ? "目前: 公開顯示" : "目前: 隱藏 (僅用於送禮)"}
                        </p>
                    </CardContent>
                </Card>

                {/* Phone (Read Only) */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-end justify-between gap-4">
                            <div className="flex-1 space-y-2">
                                <label className="text-sm font-medium">手機號碼</label>
                                <Input
                                    value={profile.phoneNumber}
                                    disabled
                                    className="bg-gray-100 text-gray-500 cursor-not-allowed"
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdate({ isPhoneVisible: !profile.isPhoneVisible })}
                            >
                                {profile.isPhoneVisible ? <Eye className="text-green-600" /> : <EyeOff className="text-gray-400" />}
                            </Button>
                        </div>
                        <p className="text-xs text-muji-secondary mt-2">
                            {profile.isPhoneVisible ? "目前: 公開顯示" : "目前: 隱藏"}
                        </p>
                    </CardContent>
                </Card>

                {/* Birthday (Read Only) */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-end justify-between gap-4">
                            <div className="flex-1 space-y-2">
                                <label className="text-sm font-medium">生日</label>
                                <Input
                                    value={profile.birthday ? new Date(profile.birthday).toLocaleDateString() : "未設定"}
                                    disabled
                                    className="bg-gray-100 text-gray-500 cursor-not-allowed"
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdate({ isBirthdayVisible: !profile.isBirthdayVisible })}
                            >
                                {profile.isBirthdayVisible ? <Eye className="text-green-600" /> : <EyeOff className="text-gray-400" />}
                            </Button>
                        </div>
                        <p className="text-xs text-muji-secondary mt-2">
                            {profile.isBirthdayVisible ? "目前: 公開顯示" : "目前: 隱藏 (設為隱藏時，不會出現在朋友的生日提醒中)"}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Security Section */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold mt-8 mb-4">帳號安全</h2>
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <p className="text-sm text-gray-500">為了您的帳號安全，建議定期更改密碼。點擊下方按鈕前往修改頁面。</p>
                        <Link to="/change-password">
                            <Button variant="outline" className="w-full">
                                前往修改密碼
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>

            {/* Monetization Section */}
            <div className="space-y-4 pb-12">
                <h2 className="text-xl font-semibold mt-8 mb-4">贊助與升級</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Micro Transaction */}
                    <Card className="border-l-4 border-l-blue-500">
                        <CardHeader>
                            <CardTitle>擴充清單容量</CardTitle>
                            <CardDescription>單一清單上限 +10</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold mb-4">NT$ 30 <span className="text-sm font-normal text-gray-500">(1 USD)</span></p>

                            <div className="mb-4">
                                <label className="text-sm text-gray-500 mb-1 block">選擇要擴充的清單類型</label>
                                <select
                                    className="w-full border rounded p-2 text-sm"
                                    id="expansion-type-select"
                                >
                                    <option value="wishlists">My Wishlists (所有願望清單)</option>
                                    <option value="following">Following (追蹤名單)</option>
                                </select>
                            </div>

                            <Button className="w-full" variant="outline" onClick={() => {
                                const select = document.getElementById('expansion-type-select') as HTMLSelectElement;
                                if (!select) return;
                                const targetType = select.value;
                                openPaymentModal(30, targetType === 'following' ? "追蹤名單擴充 (+10)" : "願望清單擴充 (+10)", { purchaseType: 'limit', target: targetType });
                            }}>
                                立即購買
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Subscription */}
                    <Card className="border-l-4 border-l-amber-500 bg-amber-50/30">
                        <CardHeader>
                            <CardTitle>無限訂閱制</CardTitle>
                            <CardDescription>解鎖所有清單無限容量</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold mb-4">NT$ 90 <span className="text-sm font-normal text-gray-500">/月 (3 USD)</span></p>

                            {profile.isPremium ? (
                                <div className="space-y-3">
                                    <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded text-center font-medium border border-amber-200">
                                        ✨ 您目前是尊榮會員
                                    </div>
                                    <Button className="w-full bg-white text-red-600 border border-red-200 hover:bg-red-50" onClick={() => {
                                        openModal(
                                            "取消訂閱確認",
                                            "您確定要取消訂閱嗎？\n\n取消後：\n• 您的容量上限將恢復為預設值 (100)\n• 既有超過的項目可能無法編輯",
                                            async () => {
                                                try {
                                                    const res = await fetch(`${API_URL}/users/me/subscription/cancel`, {
                                                        method: 'POST',
                                                        headers: { 'Authorization': `Bearer ${token}` }
                                                    });
                                                    if (res.ok) {
                                                        alert("訂閱已取消，權益已變更。");
                                                        window.location.reload();
                                                    } else {
                                                        alert("取消失敗");
                                                    }
                                                } catch (e) { console.error(e); }
                                            },
                                            "destructive",
                                            "確認取消訂閱"
                                        );
                                    }}>
                                        取消訂閱
                                    </Button>
                                </div>
                            ) : <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white" onClick={() => {
                                openPaymentModal(90, "無限訂閱方案 (Premium)", { purchaseType: 'PREMIUM' });
                            }}>
                                立即訂閱 (NT$ 90)
                            </Button>
                            }

                        </CardContent>
                    </Card>
                </div>

                {/* Purchase History Link */}
                <div className="mt-6 pt-6 border-t">
                    <h3 className="text-lg font-medium mb-2">交易紀錄</h3>
                    <Link to="/purchase-history">
                        <Button variant="outline" className="w-full md:w-auto">
                            查看贊助與購買紀錄
                        </Button>
                    </Link>
                </div>
                <ActionConfirmModal
                    isOpen={modalConfig.isOpen}
                    onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                    onConfirm={modalConfig.onConfirm}
                    title={modalConfig.title}
                    message={modalConfig.message}
                    confirmText={modalConfig.confirmText}
                    variant={modalConfig.variant}
                    isProcessing={modalConfig.isProcessing}
                />
                <PaymentModal
                    isOpen={paymentModalConfig.isOpen}
                    onClose={() => setPaymentModalConfig(prev => ({ ...prev, isOpen: false }))}
                    amount={paymentModalConfig.amount}
                    itemName={paymentModalConfig.itemName}
                    onPaymentSuccess={handlePaymentSuccess}
                    extraPayload={paymentModalConfig.extraPayload}
                />
            </div>
        </div >
    );
}
