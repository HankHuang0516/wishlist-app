
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/Card";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Upload, User as UserIcon, Download } from "lucide-react";
import ActionConfirmModal from "../components/ActionConfirmModal";
import PaymentModal from "../components/PaymentModal";
import { API_URL, API_BASE_URL } from '../config';
import { t } from "../utils/localization";

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
            confirmText: confirmTextWithPrice || t('common.confirm')
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
        alert(`Payment Successful! Transaction ID: ${data.transactionId}`);
        window.location.reload();
    };

    useEffect(() => {
        if (token) {
            fetchProfile();
        }
    }, [token]);

    const fetchProfile = async () => {
        try {
            if (!token) {
                // Token not yet loaded, keep showing loading state
                return;
            }
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
            // Only set loading to false if we actually attempted the fetch
            if (token) {
                setLoading(false);
            }
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

    const [isUploading, setIsUploading] = useState(false);

    // PWA Install State
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

    useEffect(() => {
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const formData = new FormData();
            formData.append('avatar', file);

            setIsUploading(true);
            try {
                const res = await fetch(`${API_URL}/users/me/avatar`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                if (res.ok) {
                    const data = await res.json();
                    setProfile(prev => prev ? { ...prev, avatarUrl: data.avatarUrl } : null);
                    alert(t('settings.uploaded') || 'Avatar updated successfully!');
                } else {
                    throw new Error('Upload failed');
                }
            } catch (error) {
                console.error(error);
                alert(t('common.error') || 'Update failed, please try again.');
            } finally {
                setIsUploading(false);
                // Reset input value to allow re-uploading the same file if needed in future, 
                // though usually react handles this. Safest to clear it if we want to force change event next time.
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    };

    if (loading) return <div className="p-8 text-center">{t('common.loading')}</div>;
    if (!profile) return <div className="p-8 text-center">{t('common.error')} <Link to="/login" className="text-blue-500 underline">{t('nav.login')}</Link></div>;

    const nicknameCount = profile.nicknames ? profile.nicknames.split(',').filter(s => s.trim()).length : 0;

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold text-muji-primary">{t('settings.profile')}</h1>

            {/* Avatar Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>{t('settings.avatar')}</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUpdate({ isAvatarVisible: !profile.isAvatarVisible })}
                            title={profile.isAvatarVisible ? t('settings.public') : t('settings.hidden')}
                        >
                            {profile.isAvatarVisible ? <Eye className="text-green-600" /> : <EyeOff className="text-gray-400" />}
                        </Button>
                    </CardTitle>
                    <CardDescription>
                        {profile.isAvatarVisible
                            ? t('settings.avatarVisible')
                            : t('settings.avatarHidden')}
                    </CardDescription>
                    {/* Read-Only Name Display */}
                    <div className="mt-4 p-3 bg-gray-50 rounded-md border border-gray-100 flex flex-col gap-1">
                        <span className="text-xs text-muji-secondary font-medium">{t('register.name')} (Login Name)</span>
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
                        <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                            {isUploading ? (
                                <>
                                    <span className="animate-spin mr-2">⏳</span> {/* Using simple emoji as spinner placeholder or lucide Upload/Loader if available */}
                                    {t('settings.uploading')}
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4 mr-2" />
                                    {t('settings.changeAvatar')}
                                </>
                            )}
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
                    <CardTitle>{t('settings.nicknames')}</CardTitle>
                    <CardDescription>
                        {t('settings.nicknamesDesc')}
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
                        placeholder={t('settings.nicknamesPlaceholder')}
                    />
                    <p className="text-xs text-muji-secondary mt-2">{t('settings.nicknamesPlaceholder')}</p>
                </CardContent>
            </Card>

            {/* Private Info Section */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold mt-8 mb-4">{t('settings.privacyTitle')}</h2>

                {/* Real Name */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-end justify-between gap-4">
                            <div className="flex-1 space-y-2">
                                <label className="text-sm font-medium">{t('settings.realName')}</label>
                                <Input
                                    value={profile.realName || ""}
                                    onChange={(e) => setProfile({ ...profile, realName: e.target.value })}
                                    onBlur={(e) => handleUpdate({ realName: e.target.value })}
                                    placeholder={t('settings.realName')}
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdate({ isRealNameVisible: !profile.isRealNameVisible })}
                                title={profile.isRealNameVisible ? t('settings.public') : t('settings.hidden')}
                            >
                                {profile.isRealNameVisible ? <Eye className="text-green-600" /> : <EyeOff className="text-gray-400" />}
                            </Button>
                        </div>
                        <p className="text-xs text-muji-secondary mt-2">
                            {profile.isRealNameVisible ? t('settings.statusPublic') : t('settings.statusHidden')}
                        </p>
                    </CardContent>
                </Card>

                {/* Address */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-end justify-between gap-4">
                            <div className="flex-1 space-y-2">
                                <label className="text-sm font-medium">{t('settings.address')}</label>
                                <Input
                                    value={profile.address || ""}
                                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                                    onBlur={(e) => handleUpdate({ address: e.target.value })}
                                    placeholder={t('settings.address')}
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
                            {profile.isAddressVisible ? t('settings.statusPublic') : t('settings.statusHidden')}
                        </p>
                    </CardContent>
                </Card>

                {/* Phone (Read Only) */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-end justify-between gap-4">
                            <div className="flex-1 space-y-2">
                                <label className="text-sm font-medium">{t('settings.phone')}</label>
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
                            {profile.isPhoneVisible ? t('settings.statusPublic') : t('settings.statusHidden')}
                        </p>
                    </CardContent>
                </Card>

                {/* Birthday (Read Only) */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-end justify-between gap-4">
                            <div className="flex-1 space-y-2">
                                <label className="text-sm font-medium">{t('settings.birthday')}</label>
                                <Input
                                    value={profile.birthday ? new Date(profile.birthday).toLocaleDateString() : "Not set"}
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
                            {profile.isBirthdayVisible ? t('settings.statusPublic') : t('settings.statusHiddenBirthday')}
                        </p>
                    </CardContent>
                </Card>
            </div>




            {/* App Installation Section - Only visible if installable or on mobile not installed */}

            {/* 1. Native Install Button (Android/Desktop when event fires) */}
            {deferredPrompt && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold mt-8 mb-4">{t('settings.installApp')}</h2>
                    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100">
                        <CardContent className="pt-6 flex items-center justify-between">
                            <div>
                                <h3 className="font-medium text-lg text-blue-900">Wishlist.ai</h3>
                                <p className="text-sm text-blue-700 mt-1">{t('settings.installDesc')}</p>
                            </div>
                            <Button
                                onClick={handleInstallClick}
                                className="bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all active:scale-95"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                {t('settings.installBtn')}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* 2. iOS Manual Instructions (Always show on iOS if not installed) */}
            {(!deferredPrompt && /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches) && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold mt-8 mb-4">{t('settings.installApp')} (iOS)</h2>
                    <Card className="bg-gray-50 border-gray-200">
                        <CardContent className="pt-6">
                            <h3 className="font-medium text-lg text-gray-900">How to install?</h3>
                            <ol className="list-decimal list-inside text-gray-700 mt-2 space-y-2 text-sm">
                                <li>Tap <span className="font-bold">Share</span> button</li>
                                <li>Scroll down and tap <span className="font-bold">Add to Home Screen</span></li>
                                <li>Tap <span className="font-bold">Add</span></li>
                            </ol>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* 3. Android Manual Instructions (Fallback if prompt doesn't fire) */}
            {(!deferredPrompt && /Android/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches) && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold mt-8 mb-4">{t('settings.installApp')} (Android)</h2>
                    <Card className="bg-gray-50 border-gray-200">
                        <CardContent className="pt-6">
                            <h3 className="font-medium text-lg text-gray-900">Don't see the button?</h3>
                            <p className="text-sm text-gray-600 mb-3">Manually install:</p>
                            <ol className="list-decimal list-inside text-gray-700 mt-2 space-y-2 text-sm">
                                <li>Tap the <span className="font-bold">Menu icon</span> (three dots)</li>
                                <li>Tap <span className="font-bold">Install App</span> or <span className="font-bold">Add to Home screen</span></li>
                                <li>Tap <span className="font-bold">Install</span></li>
                            </ol>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* 4. Desktop/Generic Instructions (Fallback for PC/Mac) */}
            {(!deferredPrompt && !/Android|iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches) && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold mt-8 mb-4">{t('settings.installApp')} (Desktop)</h2>
                    <Card className="bg-gray-50 border-gray-200">
                        <CardContent className="pt-6">
                            <h3 className="font-medium text-lg text-gray-900">How to install?</h3>
                            <p className="text-sm text-gray-600 mb-3">Check address bar for install icon <Download className="inline w-4 h-4 mx-1" /></p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Security Section */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold mt-8 mb-4">{t('settings.securityTitle')}</h2>
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <p className="text-sm text-gray-500">{t('settings.securityDesc')}</p>
                        <Link to="/change-password">
                            <Button variant="outline" className="w-full">
                                {t('settings.changePassword')}
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>

            {/* Monetization Section */}
            <div className="space-y-4 pb-12">
                <h2 className="text-xl font-semibold mt-8 mb-4">{t('settings.monetizationTitle')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Micro Transaction */}
                    <Card className="border-l-4 border-l-blue-500">
                        <CardHeader>
                            <CardTitle>{t('settings.expandList')}</CardTitle>
                            <CardDescription>{t('settings.expandListDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold mb-4">NT$ 30 <span className="text-sm font-normal text-gray-500">(1 USD)</span></p>

                            <div className="mb-4">
                                <label className="text-sm text-gray-500 mb-1 block">Type</label>
                                <select
                                    className="w-full border rounded p-2 text-sm"
                                    id="expansion-type-select"
                                >
                                    <option value="wishlists">{t('dashboard.myWishlists')}</option>
                                    <option value="following">{t('social.following')}</option>
                                </select>
                            </div>

                            <Button className="w-full" variant="outline" onClick={() => {
                                const select = document.getElementById('expansion-type-select') as HTMLSelectElement;
                                if (!select) return;
                                const targetType = select.value;
                                openPaymentModal(30, targetType === 'following' ? "Following Expansion (+10)" : "Wishlist Expansion (+10)", { purchaseType: 'limit', target: targetType });
                            }}>
                                {t('settings.buyNow')}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Subscription */}
                    <Card className="border-l-4 border-l-amber-500 bg-amber-50/30">
                        <CardHeader>
                            <CardTitle>{t('settings.premiumTitle')}</CardTitle>
                            <CardDescription>{t('settings.premiumDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold mb-4">NT$ 90 <span className="text-sm font-normal text-gray-500">/mo (3 USD)</span></p>

                            {profile.isPremium ? (
                                <div className="space-y-3">
                                    <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded text-center font-medium border border-amber-200">
                                        {t('settings.isPremium')}
                                    </div>
                                    <Button className="w-full bg-white text-red-600 border border-red-200 hover:bg-red-50" onClick={() => {
                                        openModal(
                                            t('settings.cancelSubscription'),
                                            "Are you sure you want to cancel? \n\nYour limit will revert to default (100).",
                                            async () => {
                                                try {
                                                    const res = await fetch(`${API_URL}/users/me/subscription/cancel`, {
                                                        method: 'POST',
                                                        headers: { 'Authorization': `Bearer ${token}` }
                                                    });
                                                    if (res.ok) {
                                                        alert("Subscription cancelled.");
                                                        window.location.reload();
                                                    } else {
                                                        alert("Failed to cancel");
                                                    }
                                                } catch (e) { console.error(e); }
                                            },
                                            "destructive",
                                            t('common.confirm')
                                        );
                                    }}>
                                        {t('settings.cancelSubscription')}
                                    </Button>
                                </div>
                            ) : <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white" onClick={() => {
                                openPaymentModal(90, "Premium Subscription", { purchaseType: 'PREMIUM' });
                            }}>
                                {t('settings.subscribe')} (NT$ 90)
                            </Button>
                            }

                        </CardContent>
                    </Card>
                </div>

                {/* Debug Tools Section - Admin Only */}
                {profile.phoneNumber === '0935065876' && (
                    <div className="mt-8 pt-6 border-t border-gray-200">
                        <h2 className="text-xl font-semibold mb-4 text-gray-700">System Diagnostics (Admin Only)</h2>
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="font-medium text-lg">Test Email</h3>
                                        <p className="text-sm text-gray-500">
                                            Internal system integrity check.
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        onClick={async () => {
                                            const btn = document.getElementById('debug-email-btn');
                                            if (btn) btn.innerText = "Testing...";
                                            try {
                                                const res = await fetch(`${API_URL}/feedback/test`, {
                                                    method: 'POST',
                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                });
                                                const json = await res.json();
                                                alert("Test Result:\n" + JSON.stringify(json, null, 2));
                                            } catch (e: any) {
                                                alert("Connection Failed: " + e.message);
                                            } finally {
                                                if (btn) btn.innerText = "Send Test Email";
                                            }
                                        }}
                                        id="debug-email-btn"
                                    >
                                        Send Test Email
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Purchase History Link */}
                <div className="mt-6 pt-6 border-t">
                    <h3 className="text-lg font-medium mb-2">{t('settings.historyTitle')}</h3>
                    <Link to="/purchase-history">
                        <Button variant="outline" className="w-full md:w-auto">
                            {t('settings.viewHistory')}
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
