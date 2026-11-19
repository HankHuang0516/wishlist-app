import { useRef, useState } from 'react';
import { productShareLines, productSharePath, withShareUrl, type ShareProductKind } from '../../../mobile/shared/shareText';
import { getDisplayLocale } from '../utils/localization';

const say = (zh: string, en: string) => getDisplayLocale().startsWith('zh') ? zh : en;
export const shareLocale = () => getDisplayLocale().startsWith('zh') ? 'zh' as const : 'en' as const;

/** What is shared: a line or two of text and the address they are about. */
export type ShareContent = { title: string; lines: string; url: string };

/** A product as the web page shares it: the words the app uses, and the address of the product's own page here. */
export function productShareContent(product: { kind: ShareProductKind; id: string; title: string }, price: string, version?: number): ShareContent | null {
  const path = productSharePath(product.kind, product.id, version);
  return path ? { title: product.title, lines: productShareLines(product.title, price, shareLocale()), url: new URL(path, window.location.origin).toString() } : null;
}

/** One share at a time: the device's share sheet where the browser has one, otherwise the clipboard; when neither
 *  works the text and address are shown to copy by hand. Closing the share sheet is not a failure. */
export function useShareText() {
  const gate = useRef(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [manual, setManual] = useState(false);
  async function run(content: ShareContent, sheet: boolean) {
    if (gate.current) return;
    gate.current = true; setBusy(true); setNotice('');
    try {
      if (sheet && typeof navigator.share === 'function') await navigator.share({ title: content.title, text: content.lines, url: content.url });
      else { await navigator.clipboard.writeText(withShareUrl(content.lines, content.url)); setNotice(say('文字與連結已複製', 'Text and link copied')); }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setManual(true); setNotice(say('無法自動分享，請手動複製下方文字與連結。', 'Automatic sharing is unavailable. Copy the text and link below.'));
    } finally { gate.current = false; setBusy(false); }
  }
  return { busy, notice, manual, share: (content: ShareContent) => run(content, true), copy: (content: ShareContent) => run(content, false) };
}
