import { ArrowLeft, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettingsProfile } from '../lib/useSettingsProfile';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { t } from '../utils/localization';
import { settingsMessage, settingsText as st } from '../lib/settingsCopy';

export default function NotificationsSettingsPage() {
    const { user, token } = useAuth();
    if (!user || !token) return <div className="container mx-auto p-4 max-w-2xl">
        <h1 className="text-2xl font-bold mb-4">{t('settings.notifications')}</h1>
        <p>{st('登入後才能讀取或變更通知偏好。')}</p>
        <Link className="inline-flex min-h-11 items-center text-blue-600 underline" to="/login?next=%2Fsettings%2Fnotifications">{st('登入後返回通知設定')}</Link>
    </div>;
    return <NotificationsSession key={`${user.id}:${token}`} token={token} userId={user.id} />;
}

function NotificationsSession({ token, userId }: { token: string; userId: number }) {
    // Share Settings' encrypted, API/account-scoped operation journal. A
    // pending personal-profile operation must never be replaced by a toggle.
    const settings = useSettingsProfile(token, userId);
    const notice = settings.notice === '資料已被其他操作更新；本次未套用。請核對保留的草稿後再儲存。'
        ? '資料已被其他操作更新；本次未套用。畫面顯示後台目前偏好，請核對後再操作。'
        : settings.notice === '原操作已安全取消，不會再套用；未儲存的草稿仍保留在本頁。'
            ? '原操作已安全取消，不會再套用；後台已儲存的偏好不會撤回。'
            : settings.notice;
    return <div className="container mx-auto p-4 max-w-2xl">
        <Link className="inline-flex min-h-11 items-center mb-4 text-muji-primary" to="/settings">
            <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />{t('common.back')}
        </Link>
        <h1 className="text-2xl font-bold text-muji-primary mb-6">{t('settings.notifications')}</h1>
        <Card className="bg-white">
            <CardHeader><CardTitle className="text-lg">{t('settings.emailNotifs')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                {settings.loading ? <p role="status">{st('正在讀取已保存的通知偏好…')}</p> : settings.profile && <>
                    <label htmlFor="marketing" className="flex min-h-11 items-center justify-between gap-4 cursor-pointer">
                        <span><span id="marketing-label" className="text-sm font-medium text-gray-700">{t('settings.notifMarketing')}</span>
                            <span id="marketing-help" className="block text-xs text-gray-500 mt-1">{st('是否願意接收新功能與活動資訊。預設關閉；目前只保存偏好，行銷郵件寄送尚未開通。')}</span>
                        </span>
                        <input id="marketing" type="checkbox" className="h-5 w-5 shrink-0 accent-muji-primary"
                            aria-labelledby="marketing-label" aria-describedby="marketing-help" checked={settings.profile.marketingEmailsEnabled}
                            disabled={settings.locked} onChange={event => void settings.update({ marketingEmailsEnabled: event.target.checked })} />
                    </label>
                    <p className="text-sm">{st('後台確認的偏好：')} {settings.profile.marketingEmailsEnabled ? st('接收') : st('不接收')}</p>
                    {settings.savedField === 'marketingEmailsEnabled' && <span className="flex items-center text-sm text-green-700"><Check className="w-4 h-4 mr-1" aria-hidden="true" />{t('common.saved')}</span>}
                </>}
                <div className="border-t pt-4">
                    <h2 className="text-sm font-medium">{st('帳號必要郵件')}</h2>
                    <p className="text-xs text-gray-600 mt-1">{st('你主動要求的信箱驗證與密碼重設不受行銷偏好影響。這不是所有安全事件的自動通知訂閱。')}</p>
                </div>
                <div className="border-t pt-4">
                    <h2 className="text-sm font-medium">{st('瀏覽器推播')}</h2>
                    <p className="text-xs text-gray-600 mt-1">{st('尚未開通；本頁不會要求推播權限或宣稱已啟用。聊天與面交資訊可在網站聊天室查看。')}</p>
                    <Link className="inline-flex min-h-11 items-center text-blue-600 underline" to="/chat">{st('查看聊天與面交')}</Link>
                </div>
            </CardContent>
        </Card>
        {notice && <p role="status" aria-live="polite" className="mt-4 text-sm">{settingsMessage(notice)}</p>}
        {settings.pending && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-sm">{st('有一筆帳號設定操作待確認。變更暫停，避免覆蓋原操作；重新開啟只會查核，不會自動重送。')}</p>
            <div className="flex flex-wrap gap-2">
                <Button className="min-h-11" disabled={settings.busy} onClick={() => void settings.recover('read')}>{st('查核原儲存結果')}</Button>
                {settings.cleanupOnly ? <Button className="min-h-11" disabled={settings.busy} onClick={() => void settings.recover('cleanup')}>{st('重試清理恢復標記')}</Button> : <>
                    <Button className="min-h-11" disabled={settings.busy} onClick={() => void settings.recover('retry')}>{st('重試同一儲存操作')}</Button>
                    <Button className="min-h-11" variant="outline" disabled={settings.busy} onClick={() => settings.setDiscardConfirm(true)}>{st('安全取消原操作')}</Button>
                </>}
            </div>
            {settings.discardConfirm && <div><p className="text-sm">{st('尚未套用的原操作將永久停止；已保存的資料不會撤回。是否繼續？')}</p>
                <Button className="min-h-11" disabled={settings.busy} onClick={() => void settings.recover('abandon')}>{st('確認停止原操作')}</Button>
                <Button className="min-h-11" variant="outline" disabled={settings.busy} onClick={() => settings.setDiscardConfirm(false)}>{st('保留原操作')}</Button>
            </div>}
            <Link className="inline-flex min-h-11 items-center text-blue-600 underline" to="/settings">{st('查看完整帳號設定')}</Link>
        </div>}
        {settings.storageError && <Button className="mt-4 min-h-11" disabled={settings.loading || settings.busy} onClick={settings.retryRead}>{st('重試讀取')}</Button>}
    </div>;
}
