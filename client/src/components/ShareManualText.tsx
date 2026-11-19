import { withShareUrl } from '../../../mobile/shared/shareText';
import type { ShareContent } from '../lib/useShareText';
import { getDisplayLocale } from '../utils/localization';

const say = (zh: string, en: string) => getDisplayLocale().startsWith('zh') ? zh : en;

/** The text and address to copy by hand, for a browser that can neither share nor copy. */
export default function ShareManualText({ content }: { content: ShareContent }) {
  const label = say('分享文字與連結', 'Sharing text and link');
  return <label className="block space-y-2">
    <span className="block text-sm font-semibold">{label}</span>
    <textarea aria-label={label} readOnly rows={5} value={withShareUrl(content.lines, content.url)} onFocus={event => event.currentTarget.select()} className="block w-full rounded-xl border border-stone-300 bg-stone-50 p-3 text-sm" />
    <span className="block text-sm text-stone-600">{say('選取並複製文字，再貼到您要分享的地方。', 'Select and copy the text, then paste it where you want to share.')}</span>
  </label>;
}
