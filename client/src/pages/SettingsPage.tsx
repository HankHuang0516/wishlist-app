
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/Card";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, User as UserIcon, Download, Camera, Loader2, Gift, Package, MessageCircle, Users, ChevronRight, Settings } from "lucide-react";
import { API_URL, API_BASE_URL } from '../config';
import { t, getUserLocale } from "../utils/localization";
import AccountSecurityPanel from '../components/AccountSecurityPanel';
import AccountBenefits from '../components/AccountBenefits';
import './SettingsPage.css';
import { useSettingsProfile } from '../lib/useSettingsProfile';

export default function SettingsPage() {
    const { token, user } = useAuth();
    return <SettingsSession key={`${user?.id ?? 'anonymous'}:${token ?? ''}`} />;
}

function SettingsSession() {
    const { token, user } = useAuth();
    const navigate = useNavigate();
    const settings = useSettingsProfile(token, user?.id);
    const { profile, loading, savedField, update: handleUpdate } = settings;
    const [aiUsage, setAiUsage] = useState<{ used: number; limit: number; isUnlimited: boolean } | null>(null);
    const [feedback, setFeedback] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const active = useRef(true);
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

    useEffect(() => {
        let current = true;
        const controller = new AbortController();
        if (!token) navigate('/login?next=%2Fsettings');
        else void (async () => {
            try {
                const res = await fetch(`${API_URL}/users/me/ai-usage`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
                if (!res.ok) return;
                const data = await res.json();
                if (current && Number.isSafeInteger(data.used) && data.used >= 0 && Number.isSafeInteger(data.limit) && data.limit >= 0 && typeof data.isUnlimited === 'boolean') setAiUsage(data);
            } catch { /* unavailable is not zero */ }
        })();
        return () => { current = false; controller.abort(); };
    }, [token, navigate]);

    const [changingLang, setChangingLang] = useState(false);

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
        if (settings.locked || isUploading) return;
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
                    if (!active.current) return;
                    settings.patchDisplay({ avatarUrl: data.avatarUrl });
                    setFeedback({ message: t('settings.uploaded') || 'Avatar updated successfully!', type: 'success' });
                    setTimeout(() => setFeedback(null), 3000);
                } else {
                    throw new Error('Upload failed');
                }
            } catch (error) {
                console.error(error);
                setFeedback({ message: t('common.error') || 'Update failed, please try again.', type: 'error' });
                setTimeout(() => setFeedback(null), 3000);
            } finally {
                setIsUploading(false);
                // Reset input value to allow re-uploading the same file if needed in future, 
                // though usually react handles this. Safest to clear it if we want to force change event next time.
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    };

    const handleGenerateApiKey = async () => {
        try {
            const res = await fetch(`${API_URL}/users/me/apikey`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (!active.current) return;
                settings.patchDisplay({ apiKey: data.apiKey });
                setFeedback({ message: 'API Key Generated!', type: 'success' });
                setTimeout(() => setFeedback(null), 3000);
            }
        } catch (error) {
            console.error(error);
            setFeedback({ message: 'Failed to generate key', type: 'error' });
        }
    };

    if (loading) return <div className="p-8 text-center">{t('common.loading')}</div>;
    if (!profile) return <div className="p-8 text-center"><p role="alert">{settings.notice || t('common.error')}</p><Button onClick={settings.retryRead}>重試讀取設定</Button> <Link to="/login?next=%2Fsettings" className="text-blue-500 underline">{t('nav.login')}</Link></div>;

    const nicknameCount = profile.nicknames ? profile.nicknames.split(',').filter(s => s.trim()).length : 0;

    return (
        <div className="settings-hub max-w-3xl mx-auto space-y-4 pb-8 relative">
            {feedback && (
                <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-full shadow-lg z-50 text-sm font-medium animate-fade-in-down ${feedback.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
                    {feedback.message}
                </div>
            )}
            <div><h1 className="text-3xl font-bold text-muji-primary">個人資料</h1><p className="mt-1 text-sm text-gray-500">管理你的帳號與偏好設定</p></div>
            {settings.notice && <section aria-label="個人資料儲存狀態" className="rounded-md border bg-white p-3 text-sm"><p role="status">{settings.notice}</p>
                {settings.pending && <div className="mt-2 flex flex-wrap gap-2">
                    <Button disabled={settings.busy} onClick={() => settings.recover('read')}>查核原儲存結果</Button>
                    {settings.cleanupOnly ? <Button disabled={settings.busy} onClick={() => settings.recover('cleanup')}>重試清理恢復標記</Button> : <><Button disabled={settings.busy} onClick={() => settings.recover('retry')}>重試同一儲存操作</Button><Button variant="outline" disabled={settings.busy} onClick={() => settings.setDiscardConfirm(true)}>安全取消原操作</Button></>}
                </div>}
                {settings.discardConfirm && <div className="mt-2 rounded-md bg-amber-50 p-3"><p>尚未套用的原操作將永久停止；若後台已儲存，不會撤回資料。是否繼續？</p><Button disabled={settings.busy} onClick={() => settings.recover('abandon')}>確認停止原操作</Button><Button disabled={settings.busy} variant="outline" onClick={() => settings.setDiscardConfirm(false)}>保留原操作</Button></div>}
                {settings.storageError && <Button onClick={settings.retryRead}>重試安全讀取</Button>}
            </section>}

            {/* Language Section */}
            <Card className="settings-language">
                <CardHeader className="pb-3">
                    <CardTitle>{t('common.language')}</CardTitle>
                    <CardDescription>{t('common.languageDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button
                        variant={getUserLocale().startsWith('zh') ? "primary" : "outline"}
                        onClick={() => {
                            if (changingLang) return;
                            setChangingLang(true);
                            localStorage.setItem('user-locale', 'zh-TW');
                            setTimeout(() => window.location.reload(), 500);
                        }}
                        className="flex-1"
                        disabled={changingLang}
                    >
                        {changingLang && getUserLocale().startsWith('zh') ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        繁體中文
                    </Button>
                    <Button
                        variant={!getUserLocale().startsWith('zh') ? "primary" : "outline"}
                        onClick={() => {
                            if (changingLang) return;
                            setChangingLang(true);
                            localStorage.setItem('user-locale', 'en-US');
                            setTimeout(() => window.location.reload(), 500);
                        }}
                        className="flex-1"
                        disabled={changingLang}
                    >
                        {changingLang && !getUserLocale().startsWith('zh') ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        English
                    </Button>
                </CardContent>
            </Card>

            {/* Avatar Section */}
            <section aria-labelledby="settings-actions" className="rounded-lg border border-muji-border bg-white p-5 shadow-sm">
                <h2 id="settings-actions" className="mb-3 font-semibold">我的功能</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[{ to: '/wishes', label: '我的願望', description: '拍照與 AI 辨識', icon: Gift },
                        { to: '/my-listings', label: '我的商品', description: '閱覽與管理', icon: Package },
                        { to: '/chat', label: '聊天與面交', description: '訊息與預約', icon: MessageCircle },
                        { to: '/sell', label: '刊登好物', description: '連拍或批次上傳', icon: Camera }].map(({ to, label, description, icon: Icon }) => <Link key={to} to={to} aria-label={`${label} · ${description}`} className="flex min-h-11 min-w-0 items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"><Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="text-blue-700">{label}</span><ChevronRight className="ml-auto h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" /></Link>)}
                </div>
            </section>
            <fieldset disabled={settings.locked || isUploading} className="min-w-0 space-y-4 border-0 p-0"><legend className="sr-only">個人資料與隱私設定</legend><Card className="settings-avatar">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>大頭照與暱稱</span>
                        <div className="flex items-center gap-2">
                            <label htmlFor="avatar-toggle" className="text-sm font-normal text-gray-600 cursor-pointer select-none">
                                {profile.isAvatarVisible ? t('settings.public') : t('settings.hidden')}
                            </label>
                            <input
                                id="avatar-toggle"
                                type="checkbox"
                                className="h-5 w-5 rounded border-gray-300 text-muji-primary focus:ring-muji-primary cursor-pointer"
                                checked={profile.isAvatarVisible}
                                onChange={(e) => handleUpdate({ isAvatarVisible: e.target.checked })}
                            />
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-4">
                    {/* Avatar Image & Overlay */}
                    <div
                        className="relative group cursor-pointer w-16 h-16 shrink-0"
                        role="button"
                        tabIndex={settings.locked || isUploading ? -1 : 0}
                        aria-disabled={settings.locked || isUploading}
                        aria-label="上傳大頭照"
                        onKeyDown={event => { if (!settings.locked && !isUploading && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); fileInputRef.current?.click(); } }}
                        onClick={() => { if (!settings.locked && !isUploading) fileInputRef.current?.click(); }}
                    >
                        <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden border-2 border-gray-100 relative">
                            {profile.avatarUrl ? (
                                <img src={profile.avatarUrl.startsWith('/') ? `${API_BASE_URL}${profile.avatarUrl}` : profile.avatarUrl} referrerPolicy="no-referrer" alt="大頭照" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                    <UserIcon className="w-12 h-12" />
                                </div>
                            )}
                            {!profile.isAvatarVisible && (
                                <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none">
                                    <EyeOff className="text-white drop-shadow-md w-8 h-8" />
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera className="w-8 h-8 text-white" />
                            </div>
                        </div>

                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                        />
                    </div>

                    <div className="min-w-0 flex-1 space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="nickname" className="text-sm font-medium leading-none">暱稱</label>
                            <Input
                                id="nickname"
                                value={profile.nicknames || ""}
                                    onChange={(e) => settings.edit('nicknames', e.target.value)}
                                onBlur={(e) => handleUpdate({ nicknames: e.target.value })}
                                placeholder={t('settings.nicknamesPlaceholder')}
                            />
                            <div className="flex justify-between items-center h-4">
                                <p className="text-xs text-muji-secondary">{t('register.name')}: {profile.name}</p>
                                <span id="nickname-saved" role="status" className={`text-xs text-green-600 font-medium transition-opacity duration-500 ${savedField === 'nicknames' ? 'opacity-100' : 'opacity-0'}`}>
                                    {savedField === 'nicknames' ? t('common.saved') : ''}
                                </span>
                            </div>
                        </div>

                        {isUploading && (
                            <div className="flex items-center gap-2 text-sm text-muji-primary">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {t('settings.uploading')}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card></fieldset>

            {/* Notification Settings */}
            <Link to="/settings/notifications" className="block">
                <Card className="hover:bg-gray-50 transition-colors cursor-pointer border-l-4 border-l-muji-secondary">
                    <CardHeader className="flex flex-row items-center justify-between py-4">
                        <div className="space-y-1">
                            <CardTitle className="text-lg">{t('settings.notifications')}</CardTitle>
                            <CardDescription>{t('settings.emailNotifs')}</CardDescription>
                        </div>
                        <div className="text-muji-secondary">
                            <i className="fas fa-chevron-right"></i> {/* Or just chevron icon */}
                            <span className="text-2xl">›</span>
                        </div>
                    </CardHeader>
                </Card>
            </Link>

            {/* Private Info Section */}
            <AccountSecurityPanel key={token} />
            <fieldset disabled={settings.locked || isUploading} className="min-w-0 border-0 p-0"><legend className="sr-only">私人資料與公開權限</legend>
            <div className="settings-private rounded-lg border border-muji-border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">{t('settings.privacyTitle')}</h2>

                {/* Real Name */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-end justify-between gap-4">
                            <div className="flex-1 space-y-2">
                                <label htmlFor="profile-real-name" className="text-sm font-medium">{t('settings.realName')}</label>
                                <Input
                                    id="profile-real-name"
                                    value={profile.realName || ""}
                                    onChange={(e) => settings.edit('realName', e.target.value)}
                                    onBlur={(e) => handleUpdate({ realName: e.target.value })}
                                    placeholder={t('settings.realName')}
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdate({ isRealNameVisible: !profile.isRealNameVisible })}
                                aria-label={profile.isRealNameVisible ? '隱藏真實姓名' : '公開真實姓名'}
                                aria-pressed={profile.isRealNameVisible}
                                title={profile.isRealNameVisible ? t('settings.public') : t('settings.hidden')}
                            >
                                {profile.isRealNameVisible ? <Eye className="text-green-600" /> : <EyeOff className="text-gray-400" />}
                            </Button>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                            <p className="text-xs text-muji-secondary">
                                {profile.isRealNameVisible ? t('settings.statusPublic') : t('settings.statusHidden')}
                            </p>
                            <span className={`text-xs text-green-600 font-medium transition-opacity duration-500 ${savedField === 'realName' ? 'opacity-100' : 'opacity-0'}`}>
                                {savedField === 'realName' ? t('common.saved') : ''}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Birthday */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-end justify-between gap-4">
                            <div className="flex-1 space-y-2">
                                <label htmlFor="profile-birthday" className="text-sm font-medium">{t('settings.birthday')}</label>
                                <Input
                                    id="profile-birthday"
                                    type="date"
                                    value={profile.birthday || ""}
                                    onChange={(e) => settings.edit('birthday', e.target.value)}
                                    onBlur={(e) => handleUpdate({ birthday: e.target.value })}
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdate({ isBirthdayVisible: !profile.isBirthdayVisible })}
                                aria-label={profile.isBirthdayVisible ? '隱藏生日' : '公開生日'}
                                aria-pressed={profile.isBirthdayVisible}
                                title={profile.isBirthdayVisible ? t('settings.public') : t('settings.hidden')}
                            >
                                {profile.isBirthdayVisible ? <Eye className="text-green-600" /> : <EyeOff className="text-gray-400" />}
                            </Button>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                            <p className="text-xs text-muji-secondary">
                                {profile.isBirthdayVisible ? t('settings.statusPublic') : t('settings.statusHidden')}
                            </p>
                            <span className={`text-xs text-green-600 font-medium transition-opacity duration-500 ${savedField === 'birthday' ? 'opacity-100' : 'opacity-0'}`}>
                                {savedField === 'birthday' ? t('common.saved') : ''}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Address */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-end justify-between gap-4">
                            <div className="flex-1 space-y-2">
                                <label htmlFor="profile-address" className="text-sm font-medium">{t('settings.address')}</label>
                                <Input
                                    id="profile-address"
                                    value={profile.address || ""}
                                    onChange={(e) => settings.edit('address', e.target.value)}
                                    onBlur={(e) => handleUpdate({ address: e.target.value })}
                                    placeholder={t('settings.address')}
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdate({ isAddressVisible: !profile.isAddressVisible })}
                                aria-label={profile.isAddressVisible ? '隱藏寄送地址' : '公開寄送地址'}
                                aria-pressed={profile.isAddressVisible}
                            >
                                {profile.isAddressVisible ? <Eye className="text-green-600" /> : <EyeOff className="text-gray-400" />}
                            </Button>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                            <p className="text-xs text-muji-secondary">
                                {profile.isAddressVisible ? t('settings.statusPublic') : t('settings.statusHidden')}
                            </p>
                            <span className={`text-xs text-green-600 font-medium transition-opacity duration-500 ${savedField === 'address' ? 'opacity-100' : 'opacity-0'}`}>
                                {savedField === 'address' ? t('common.saved') : ''}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Phone (Read Only) */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-end justify-between gap-4">
                            <div className="flex-1 space-y-2">
                                <label htmlFor="profile-phone" className="text-sm font-medium">{t('settings.phone')}</label>
                                <Input
                                    id="profile-phone"
                                    value={profile.phoneNumber}
                                    disabled
                                    className="bg-gray-100 text-gray-500 cursor-not-allowed"
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdate({ isPhoneVisible: !profile.isPhoneVisible })}
                                aria-label={profile.isPhoneVisible ? '隱藏手機號碼' : '公開手機號碼'}
                                aria-pressed={profile.isPhoneVisible}
                            >
                                {profile.isPhoneVisible ? <Eye className="text-green-600" /> : <EyeOff className="text-gray-400" />}
                            </Button>
                        </div>
                        <p className="text-xs text-muji-secondary mt-2">
                            {profile.isPhoneVisible ? t('settings.statusPublic') : t('settings.statusHidden')}
                        </p>
                    </CardContent>
                </Card>

                {/* Email (Read Only unless NULL) */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-end justify-between gap-4">
                            <div className="flex-1 space-y-2">
                                <label htmlFor="profile-email" className="text-sm font-medium">{t('settings.email')}</label>
                                <Input
                                    id="profile-email"
                                    value={profile.email || ""}
                                    disabled={settings.emailReadOnly}
                                    className={settings.emailReadOnly ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}
                                    placeholder={t('settings.emailPlaceholder')}
                                    onChange={(e) => !settings.emailReadOnly && settings.edit('email', e.target.value)}
                                    onBlur={(e) => !settings.emailReadOnly && e.target.value && handleUpdate({ email: e.target.value })}
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdate({ isEmailVisible: !profile.isEmailVisible })}
                                aria-label={profile.isEmailVisible ? '隱藏電子信箱' : '公開電子信箱'}
                                aria-pressed={profile.isEmailVisible}
                            >
                                {profile.isEmailVisible ? <Eye className="text-green-600" /> : <EyeOff className="text-gray-400" />}
                            </Button>
                        </div>
                        <p className="text-xs text-muji-secondary mt-2">
                            {profile.isEmailVisible ? t('settings.statusPublic') : t('settings.statusHidden')}
                        </p>
                        {settings.emailReadOnly && (
                            <p className="text-xs text-gray-400 mt-1">{t('settings.emailReadOnly')}</p>
                        )}
                    </CardContent>
                </Card>

            </div></fieldset>
            <AccountBenefits key={`benefits-${token}`} />
            <details className="settings-advanced rounded-lg border border-muji-border bg-white p-5 shadow-sm">
                <summary className="flex cursor-pointer list-none items-center gap-3"><Settings className="h-5 w-5" aria-hidden="true" /><span><span className="block font-semibold">進階功能</span><span className="text-xs text-gray-500">AI 整合・交易紀錄・安裝網頁 App・好友與送禮</span></span><ChevronRight className="ml-auto h-5 w-5" aria-hidden="true" /></summary>
                <div className="mt-4 space-y-3">
                    <Link to="/dashboard" className="block min-h-11 rounded-md border p-3 text-sm text-blue-700">原願望清單 · 分享與送禮</Link>
                    <Link to="/social" className="flex min-h-11 items-center gap-2 rounded-md border p-3 text-sm text-blue-700"><Users className="h-4 w-4" aria-hidden="true" />好友與社交</Link>
                    <Link to="/reports" className="block min-h-11 rounded-md border p-3 text-sm text-blue-700">我的商品檢舉 · 查看處理狀態</Link>
                </div>
            {/* App Installation Section - Only visible if installable or on mobile not installed */}

            {/* 1. Native Install Button (Android/Desktop when event fires) */}
            {
                deferredPrompt && (
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
                )
            }

            {/* 2. iOS Manual Instructions (Always show on iOS if not installed) */}
            {
                (!deferredPrompt && /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches) && (
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold mt-8 mb-4">{t('settings.installApp')} (iOS)</h2>
                        <Card className="bg-gray-50 border-gray-200">
                            <CardContent className="pt-6">
                                <h3 className="font-medium text-lg text-gray-900">{t('pwa.howTo')}</h3>
                                <ol className="list-decimal list-inside text-gray-700 mt-2 space-y-2 text-sm">
                                    <li>Tap <span className="font-bold">Share</span> button</li>
                                    <li>Scroll down and tap <span className="font-bold">Add to Home Screen</span></li>
                                    <li>Tap <span className="font-bold">Add</span></li>
                                </ol>
                            </CardContent>
                        </Card>
                    </div>
                )
            }

            {/* 3. Android Manual Instructions (Fallback if prompt doesn't fire) */}
            {/* 3. Android Manual Instructions (Fallback) */}
            {
                (!deferredPrompt && /Android/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches) && (
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold mt-8 mb-4">{t('pwa.installTitle')} ({t('pwa.android')})</h2>
                        <Card className="bg-gray-50 border-gray-200">
                            <CardContent className="pt-6">
                                <h3 className="font-medium text-lg text-gray-900">{t('pwa.noButton')}</h3>
                                <p className="text-sm text-gray-600 mb-3">{t('pwa.manual')}</p>
                                <ol className="list-decimal list-inside text-gray-700 mt-2 space-y-2 text-sm">
                                    <li><strong>{t('pwa.step1')}</strong></li>
                                    <li><strong>{t('pwa.step2')}</strong></li>
                                    <li><strong>{t('pwa.step3')}</strong></li>
                                </ol>
                            </CardContent>
                        </Card>
                    </div>
                )
            }

            {/* 4. Desktop/Generic Instructions (Fallback for PC/Mac) */}
            {
                (!deferredPrompt && !/Android|iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches) && (
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold mt-8 mb-4">{t('pwa.installTitle')} ({t('pwa.desktop')})</h2>
                        <Card className="bg-gray-50 border-gray-200">
                            <CardContent className="pt-6">
                                <h3 className="font-medium text-lg text-gray-900">{t('pwa.howTo')}</h3>
                                <p className="text-sm text-gray-600 mb-3">{t('pwa.desktopDesc')} <Download className="inline w-4 h-4 mx-1" /></p>
                            </CardContent>
                        </Card>
                    </div>
                )
            }


            {/* AI Integration */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold mt-8 mb-4">AI 整合</h2>
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <div className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
                            <p className="text-sm text-blue-800 font-medium mb-2">
                                🤖 讓 AI 幫你管理願望清單
                            </p>
                            <p className="text-sm text-blue-700">
                                點擊下方按鈕複製指令，然後貼到 ChatGPT 或 Claude 即可開始！
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <Button
                                onClick={async () => {
                                    try {
                                        const response = await fetch(`${API_URL}/users/me/ai-prompt`, {
                                            method: 'POST',
                                            headers: {
                                                'Authorization': `Bearer ${token}`,
                                                'Content-Type': 'application/json'
                                            }
                                        });
                                        if (!response.ok) throw new Error('Failed to generate prompt');
                                        const data = await response.json();
                                        await navigator.clipboard.writeText(data.prompt);
                                        setFeedback({ message: '✅ 已複製！請貼到 ChatGPT 或 Claude', type: 'success' });
                                        setTimeout(() => setFeedback(null), 3000);
                                    } catch (error) {
                                        console.error('Copy AI prompt error:', error);
                                        setFeedback({ message: '複製失敗，請重試', type: 'error' });
                                        setTimeout(() => setFeedback(null), 3000);
                                    }
                                }}
                                className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-medium"
                            >
                                <span className="mr-2">📋</span>
                                一鍵複製 AI 指令
                            </Button>
                            <Link to="/api-showcase" className="flex-1">
                                <Button variant="outline" className="w-full">
                                    <span className="mr-2">📖</span>
                                    查看 API 文件
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Monetization Section */}
            <div className="space-y-4 pb-12">
                <h2 className="text-xl font-semibold mt-8 mb-4">既有願望清單權益</h2>

                {/* AI Usage Card */}
                <Card className="border-l-4 border-l-purple-500 bg-purple-50/30">
                    <CardHeader>
                        <CardTitle>{t('ai.usageTitle')}</CardTitle>
                        <CardDescription>
                            {aiUsage?.isUnlimited
                                ? t('ai.unlimitedDesc')
                                : t('ai.freeDesc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {aiUsage?.isUnlimited ? (
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">∞</span>
                                <span className="text-green-600 font-medium">{t('ai.unlimited')}</span>
                            </div>
                        ) : aiUsage ? (
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span>{t('ai.usedToday')}</span>
                                    <span className={aiUsage.used >= aiUsage.limit ? 'text-red-500 font-bold' : 'text-gray-600'}>
                                        {aiUsage.used} / {aiUsage.limit}
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                    <div
                                        className={`h-2.5 rounded-full ${aiUsage.used >= aiUsage.limit ? 'bg-red-500' : 'bg-purple-500'}`}
                                        style={{ width: `${Math.min(100, (aiUsage.used / aiUsage.limit) * 100)}%` }}
                                    ></div>
                                </div>
                                {aiUsage.used >= aiUsage.limit && (
                                    <p className="text-xs text-red-500 mt-2">
                                        {t('ai.limitReached')}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <span className="text-gray-400">{t('common.loading')}</span>
                        )}
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Micro Transaction */}
                    <Card className="border-l-4 border-l-blue-500">
                        <CardHeader>
                            <CardTitle>{t('settings.expandList')}</CardTitle>
                            <CardDescription>{t('settings.expandListDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-gray-600">{t('settings.purchaseUnavailable')}</p>
                        </CardContent>
                    </Card>

                    {/* Subscription */}
                    <Card className="border-l-4 border-l-amber-500 bg-amber-50/30">
                        <CardHeader>
                            <CardTitle>{t('settings.premiumTitle')}</CardTitle>
                            <CardDescription>{t('settings.premiumDesc')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {profile.isPremium ? (
                                <div className="space-y-3">
                                    <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded text-center font-medium border border-amber-200">
                                        {t('settings.isPremium')}
                                    </div>
                                    <p className="text-sm text-gray-600">{t('settings.purchaseUnavailable')}</p>
                                </div>
                            ) : <p className="text-sm text-gray-600">{t('settings.purchaseUnavailable')}</p>
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

            </div>
            </details>
        </div>

    );
}
