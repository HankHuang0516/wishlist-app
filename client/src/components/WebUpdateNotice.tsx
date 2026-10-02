import MarketplaceDialog from './MarketplaceDialog';
import { useWebUpdate } from '../context/WebUpdateContext';
import { getUserLocale } from '../utils/localization';

export function updateText(key: 'title' | 'check' | 'checking' | 'current' | 'preparing' | 'ready' | 'unavailable' | 'reload' | 'save' | 'confirm' | 'continue' | 'version' | 'close') {
  const copy = {
    title: ['網站更新', 'Website updates'], check: ['檢查網站更新', 'Check for website updates'],
    checking: ['正在檢查網站更新…', 'Checking for website updates…'], current: ['目前已是可用版本。', 'You are using the available version.'],
    preparing: ['更新正在準備中，請稍後再檢查。', 'The update is being prepared. Check again shortly.'],
    ready: ['網站更新已就緒。', 'A website update is ready.'], unavailable: ['暫時無法核對更新，請確認網路後重試。', 'Updates could not be verified. Check your connection and try again.'],
    reload: ['更新網站', 'Update website'], save: ['更新會重新載入目前頁面。請先保存手上的輸入，並在原功能查核待確認操作；尚未保存的內容可能失去。', 'Updating reloads this page. Save your input and check pending operations in their original feature first; unsaved input may be lost.'],
    confirm: ['我已保存，重新載入', 'I have saved my work, reload'], continue: ['先繼續目前操作', 'Continue my current work'], version: ['目前網站版本', 'Current website version'],
    close: ['關閉', 'Close'],
  } as const;
  let chinese = false; try { chinese = getUserLocale().startsWith('zh'); } catch { /* Bounded English fallback. */ }
  return copy[key][chinese ? 0 : 1];
}
const button = 'min-h-11 rounded-md border px-3 py-2 text-sm disabled:opacity-50';
export function WebsiteUpdateControls() {
  const update = useWebUpdate(); if (!update) return null;
  return <section aria-label={updateText('title')} className="space-y-2 rounded-lg border p-4"><h3 className="font-semibold">{updateText('title')}</h3><p className="text-sm">{updateText('version')}：v{__APP_VERSION__}</p><button className={button} disabled={update.busy} onClick={update.check}>{updateText('check')}</button>{update.manual && <p role="status">{updateText(update.state.status === 'idle' ? 'checking' : update.state.status)}</p>}</section>;
}
export default function WebUpdateNotice() {
  const update = useWebUpdate(); if (!update) return null;
  const available = update.state.status === 'ready';
  return <>
    {available && <section aria-label={updateText('title')} className="border-b border-amber-200 bg-amber-50 px-4 py-3"><div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3"><p role="status">{updateText('ready')}</p><p className="text-sm">{updateText('version')}：v{__APP_VERSION__} → v{update.state.target}</p><button className={button} disabled={update.busy} onClick={update.requestReload}>{updateText('reload')}</button></div></section>}
    {update.confirming && <MarketplaceDialog title={updateText('reload')} closeLabel={updateText('close')} onClose={update.cancelReload}><div className="space-y-4"><p>{updateText('save')}</p>{update.manual && <p role="status">{updateText(update.state.status === 'idle' ? 'checking' : update.state.status)}</p>}<div className="flex flex-wrap gap-3"><button className={button} disabled={update.busy || update.state.status !== 'ready'} onClick={update.confirmReload}>{updateText('confirm')}</button><button className={button} disabled={update.busy} onClick={update.check}>{updateText('check')}</button><button className={button} onClick={update.cancelReload}>{updateText('continue')}</button></div></div></MarketplaceDialog>}
  </>;
}
