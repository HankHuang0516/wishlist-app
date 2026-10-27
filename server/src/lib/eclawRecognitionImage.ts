import { getApiUrl } from '../config/constants';
import { EclawRecognitionError } from './eclawRecognition';

type Photo = { ownerUserId: number; imageUrl: string; flickrImageUrl: string | null };
// The dedicated vision agent cannot authenticate to the owner's image proxy.
// Pass only the linked owner's existing opaque provider URL; never a user JWT.
export function eclawImageResource(imageUrl: string | null, link: string | null, ownerUserId: number, photo?: Photo | null): string {
  const prefix = getApiUrl().replace(/\/$/, '') + '/listing-media/';
  if (!imageUrl?.startsWith(prefix)) return imageUrl || link!;
  try {
    const url = new URL(photo?.flickrImageUrl ?? '');
    if (photo?.ownerUserId === ownerUserId && photo.imageUrl === imageUrl &&
        url.protocol === 'https:' && /^(?:live|farm\d+)\.staticflickr\.com$/.test(url.hostname) && !url.username && !url.password) return url.href;
  } catch { /* Fail closed rather than asking the model to guess an unreadable photo. */ }
  throw new EclawRecognitionError('Private recognition image unavailable', 'PRIVATE_IMAGE_UNAVAILABLE');
}
