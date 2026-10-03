import { getDisplayLocale } from '../utils/localization';

/** Display missing imported prices without altering the original source facts. */
export function sourceLeadPrice(value: string | null | undefined): string {
  const unavailable = () => getDisplayLocale().startsWith('zh') ? '售價待詢問' : 'Ask about price';
  if (!value?.trim()) return unavailable();
  const amount = value.trim().split(/[；;]/, 1)[0].replace(/^原帖標價\s*[：:]\s*/, '').trim();
  if (/^(?:none|null|undefined|nan)(?:\s*元)?$/i.test(amount)) return unavailable();
  return value;
}
