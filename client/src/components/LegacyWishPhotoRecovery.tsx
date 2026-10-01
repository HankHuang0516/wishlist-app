import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Button } from './ui/Button';
import MarketplaceDialog from './MarketplaceDialog';
import { createText as text } from '../lib/legacyWishCreateWeb';
import type { useLegacyWishPhoto } from '../lib/useLegacyWishPhoto';
import { t } from '../utils/localization';
type Photo=ReturnType<typeof useLegacyWishPhoto>;
export default function LegacyWishPhotoRecovery({photo,listId,locked}:{photo:Photo;listId:number;locked:boolean}) {
  const [confirm,setConfirm]=useState(false);
  const disabled=photo.busy || locked;
  return <section className="space-y-3" aria-label={text('photoRead')}>
    {photo.issue && <p role="alert">{photo.issue}</p>}{photo.notice && <p role="status">{photo.notice}</p>}
    {!photo.ready && <Button className="min-h-11" disabled={disabled} onClick={()=>void photo.restore()}>{t('common.retry')}</Button>}
    {photo.source && photo.source!==listId && <Link className="inline-flex min-h-11 items-center underline" to={'/wishlists/'+photo.source}>{text('source')}</Link>}
    {photo.removing?<Button className="min-h-11" disabled={disabled} onClick={()=>void photo.checkRemoval()}>{text('photoRemovalRead')}</Button>:photo.raw && <div className="flex flex-wrap gap-3">
      <Button className="min-h-11" disabled={disabled} onClick={()=>void photo.check('read')}>{text('photoRead')}</Button>
      {!photo.result && <Button className="min-h-11" disabled={disabled} onClick={()=>void photo.check('stop')}>{text('photoStop')}</Button>}
      {photo.result && (!photo.result.media || photo.result.media.listingId || photo.result.media.wishItemId)?<Button className="min-h-11" disabled={disabled} onClick={()=>void photo.clean()}>{text('photoClean')}</Button>:photo.usable() && <Button variant="destructive" className="min-h-11" disabled={disabled} onClick={()=>setConfirm(true)}>{text('photoRemove')}</Button>}
    </div>}
    {confirm && <MarketplaceDialog title={text('photoRemovalTitle')} closeDisabled={photo.busy} onClose={()=>setConfirm(false)} closeLabel={t('common.close')}>
      <p>{text('photoRemovalHelp')}</p><div className="mt-4 flex flex-wrap gap-3"><Button className="min-h-11" variant="secondary" disabled={photo.busy} onClick={()=>setConfirm(false)}>{t('common.cancel')}</Button><Button className="min-h-11" variant="destructive" disabled={disabled || !photo.usable()} onClick={()=>{void photo.remove().finally(()=>setConfirm(false));}}>{text('photoRemove')}</Button></div>
    </MarketplaceDialog>}
  </section>;
}
