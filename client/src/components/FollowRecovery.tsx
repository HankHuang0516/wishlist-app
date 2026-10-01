import { Button } from './ui/Button';
import type { useFollowOperation } from '../lib/useFollowOperation';
import { t } from '../utils/localization';
export default function FollowRecovery({operation:o}:{operation:ReturnType<typeof useFollowOperation>}){
    return <div className="space-y-2">
        {o.loading&&<p role="status">{t('social.followRestoring')}</p>}
        {o.notice&&<p role="status">{t('social.followNotice.'+o.notice)}</p>}
        {o.result&&<div role="status" className="rounded-lg border bg-white p-3 text-sm space-y-2"><p>{t('social.followReceipt.'+o.result.state)}</p>
            {o.result.current.targetUserId!==null&&<p>{t('social.followCurrent').replace('{id}',String(o.result.current.targetUserId))} {o.result.current.targetExists?o.result.current.isFollowing?t('social.following'):t('social.notFollowing'):t('social.targetUnavailable')}</p>}
            <p>{t('social.followReceiptExplanation')}</p></div>}
        {o.pending&&<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2"><p>{t('social.followPending')}</p><div className="flex flex-wrap gap-2">
            {o.result?<Button className="min-h-11" disabled={o.busy} onClick={()=>void o.recover('cleanup')}>{t('social.followCleanup')}</Button>:<>
                <Button className="min-h-11" disabled={o.busy||o.storageError} onClick={()=>void o.recover('read')}>{t('social.followReadReceipt')}</Button>
                <Button className="min-h-11" variant="outline" disabled={o.busy||o.storageError} onClick={()=>void o.recover('retry')}>{t('social.followRetrySame')}</Button>
                <Button className="min-h-11" variant="outline" disabled={o.busy||o.storageError} onClick={()=>o.setDiscardConfirm(true)}>{t('social.followAbandon')}</Button>
            </>}
        </div>{o.discardConfirm&&<div><p>{t('social.followAbandonWarning')}</p><Button className="min-h-11" disabled={o.busy} onClick={()=>void o.recover('abandon')}>{t('social.followConfirmAbandon')}</Button><Button className="min-h-11" variant="outline" disabled={o.busy} onClick={()=>o.setDiscardConfirm(false)}>{t('social.followKeep')}</Button></div>}</div>}
        {o.storageError&&<Button className="min-h-11" disabled={o.loading||o.busy} onClick={o.retryRead}>{t('social.followRetryRestore')}</Button>}
    </div>;
}
