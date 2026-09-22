import { getClientUrl } from '../config/constants';

/** Candidate inventory only, never proof of ownership or a deletion command.
 * Store exact known producer targets, not arbitrary URLs to fetch/unlink later.
 */
export function legacyAssetCandidate(raw: unknown): { kind: 'LOCAL' | 'FLICKR'; target: string } | null {
    if (typeof raw !== 'string' || raw.length > 2048) return null;
    let url: URL;
    try { url = new URL(raw, getClientUrl()); } catch { return null; }
    if (url.username || url.password || url.search || url.hash || /%|\\/.test(raw) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(raw)) return null;
    let own: string;
    try { own = new URL(getClientUrl()).origin; } catch { return null; }
    if (url.origin === own) {
        const match = /^\/uploads\/((?:avatar_\d{13}|\d{13}|(?:ai|url)_\d{1,10}_\d{13})\.(?:jpe?g|png|gif|webp))$/i.exec(url.pathname);
        return match ? { kind: 'LOCAL', target: match[1] } : null;
    }
    if (url.protocol === 'https:' && !url.port && /^(?:live|farm\d+)\.staticflickr\.com$/.test(url.hostname)) {
        const match = /^\/\d+\/(\d{1,20})_[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)?\.(?:jpe?g|png|gif|webp)$/.exec(url.pathname);
        return match ? { kind: 'FLICKR', target: match[1] } : null;
    }
    return null;
}
