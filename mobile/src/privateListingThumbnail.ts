import { validateApiUrl } from './api';
import { uuid } from './listingForm';

const MAX_THUMBNAIL_BYTES = 512_000;
type Transport = {
  fetcher?: typeof fetch;
  toDataUri?: (blob: Blob, signal: AbortSignal) => Promise<string>;
};

function readBlobAsDataUri(blob: Blob, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Private thumbnail cancelled')); return; }
    const reader = new FileReader();
    const cleanup = () => signal.removeEventListener('abort', cancel);
    const cancel = () => { if (reader.readyState === FileReader.LOADING) reader.abort(); cleanup(); reject(new Error('Private thumbnail cancelled')); };
    signal.addEventListener('abort', cancel, { once: true });
    reader.onloadend = () => { cleanup(); typeof reader.result === 'string'
      ? resolve(reader.result) : reject(new Error('Private thumbnail unreadable')); };
    reader.onerror = () => { cleanup(); reject(new Error('Private thumbnail unreadable')); };
    try { reader.readAsDataURL(blob); }
    catch { cleanup(); reject(new Error('Private thumbnail unreadable')); }
  });
}

/** Only fetch a server-issued private media URL from this account's API origin. */
export async function privateListingThumbnailDataUri(thumbnailUrl: string, apiUrl: string, token: string,
  signal: AbortSignal, allowLocalHttp = false, transport: Transport = {}): Promise<string> {
  const base = validateApiUrl(apiUrl, allowLocalHttp);
  const match = /^(.+)\/api\/listing-media\/([0-9a-f-]{36})\/thumbnail$/.exec(thumbnailUrl);
  if (!match || match[1] !== base || !uuid(match[2]) ||
    thumbnailUrl !== `${base}/api/listing-media/${match[2]}/thumbnail` || !token || /[\r\n]/.test(token))
    throw new Error('Untrusted private thumbnail');
  if (signal.aborted) throw new Error('Private thumbnail cancelled');
  const response = await (transport.fetcher ?? fetch)(thumbnailUrl, { headers: { Authorization: `Bearer ${token}` },
    redirect: 'error', signal });
  const type = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (!response.ok || response.redirected || response.url !== thumbnailUrl ||
    (type !== 'image/webp' && type !== 'image/jpeg')) throw new Error('Private thumbnail unavailable');
  const blob = await response.blob();
  if (blob.size < 1 || blob.size > MAX_THUMBNAIL_BYTES || signal.aborted) throw new Error('Invalid private thumbnail size');
  const uri = await (transport.toDataUri ?? readBlobAsDataUri)(blob, signal);
  if (signal.aborted || !uri.startsWith(`data:${type};base64,`) || uri.length > Math.ceil(MAX_THUMBNAIL_BYTES * 4 / 3) + 100)
    throw new Error('Invalid private thumbnail data');
  return uri;
}
