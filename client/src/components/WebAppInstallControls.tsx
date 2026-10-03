import { Download, Loader2 } from 'lucide-react';
import { useWebAppInstall } from '../context/WebAppInstallContext';
import { settingsText as st } from '../lib/settingsCopy';
import { t } from '../utils/localization';
import { Button } from './ui/Button';
import { Card, CardContent } from './ui/Card';

export function WebAppInstallControls({ reloadPending = false }: { reloadPending?: boolean }) {
  const install = useWebAppInstall();
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(navigator.userAgent);
  const installed = install.standalone || install.status === 'installed';
  const notices = {
    pending: st('請在瀏覽器的安裝視窗完成操作…'),
    cancelled: st('已取消安裝。之後可從瀏覽器選單安裝，或繼續使用網站。'),
    accepted: st('瀏覽器已接受安裝。請從裝置的 App 入口確認是否完成；仍可繼續使用網站。'),
    failed: st('無法開啟或確認安裝。請使用下方手動步驟，或繼續使用網站。'),
    timeout: st('尚未確認安裝結果。請檢查裝置的 App 入口，或繼續使用網站；不會自動重試。'),
    installed: st('瀏覽器回報網頁 App 已安裝。請從裝置的 App 入口開啟。'),
  };
  return <section className="space-y-4" aria-label={t('pwa.installTitle')}>
    {install.status !== 'idle' && <p role={install.status === 'failed' ? 'alert' : 'status'} className="rounded-md border bg-gray-50 p-3 text-sm leading-6">{notices[install.status]}</p>}
    {install.standalone && install.status !== 'installed' && <p role="status" className="rounded-md border bg-gray-50 p-3 text-sm">{st('目前已在獨立網頁 App 中使用。')}</p>}
    {!installed && (install.available || install.busy) && <>
      <h2 className="text-xl font-semibold mt-8 mb-4">{t('settings.installApp')}</h2>
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100">
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-medium text-lg text-blue-900">Wishlist.ai</h3><p className="text-sm text-blue-700 mt-1">{t('settings.installDesc')}</p></div>
          <Button disabled={install.busy || reloadPending} onClick={() => { void install.install(); }} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all active:scale-95">
            {install.busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4 mr-2" aria-hidden="true" />}
            {install.busy ? st('等待安裝結果…') : t('settings.installBtn')}
          </Button>
        </CardContent>
      </Card>
    </>}
    {!installed && !install.available && !install.busy && <>
      <h2 className="text-xl font-semibold mt-8 mb-4">{ios ? t('settings.installApp') : t('pwa.installTitle')} ({ios ? 'iOS' : android ? t('pwa.android') : t('pwa.desktop')})</h2>
      <Card className="bg-gray-50 border-gray-200"><CardContent className="pt-6">
        <h3 className="font-medium text-lg text-gray-900">{android ? t('pwa.noButton') : t('pwa.howTo')}</h3>
        {ios ? <>
          <p className="text-sm text-gray-600 mt-2">{st('請在 Safari 開啟網站。若看不到安裝選項，仍可直接使用網站。')}</p>
          <ol className="list-decimal list-inside text-gray-700 mt-2 space-y-2 text-sm">
            <li>{st('點一下「分享」按鈕')}</li><li>{st('往下捲動並選擇「加入主畫面」')}</li>
            <li>{st('若顯示「以網頁 App 開啟」，請啟用，再點「加入」。')}</li>
          </ol>
          <a href="https://support.apple.com/guide/ipad/open-as-web-app-ipad8f1f7a29/ipados" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm text-blue-700 underline">{st('Apple 安裝說明')}</a>
        </> : android ? <>
          <p className="text-sm text-gray-600 mb-3">{t('pwa.manual')}</p>
          <ol className="list-decimal list-inside text-gray-700 mt-2 space-y-2 text-sm"><li>{t('pwa.step1')}</li><li>{t('pwa.step2')}</li><li>{t('pwa.step3')}</li></ol>
          <p className="text-sm text-gray-600 mt-2">{st('若瀏覽器未提供安裝選項，請換用支援的瀏覽器，或繼續使用網站。')}</p>
        </> : <p className="text-sm text-gray-600 mb-3">{t('pwa.desktopDesc')}</p>}
      </CardContent></Card>
    </>}
  </section>;
}
