import { ArrowUpRight } from 'lucide-react';
import { sourceLeadText as text } from '../lib/sourceLeadCopy';

export default function OriginalSourceLink({ url, compact = false }: { url: string; compact?: boolean }) {
  const host = new URL(url).hostname;
  const facebook = ['facebook.com', 'fb.com'].some(domain => host === domain || host.endsWith('.' + domain));
  return <a href={url} target="_blank" rel="noopener noreferrer" className={'group flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 transition hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ' + (compact ? 'px-3 py-2 text-sm' : 'px-4 py-3')}>
    <span className="min-w-0"><span className="font-semibold">{text(facebook ? '查看 Facebook 原文' : '原始來源')}</span>{!compact && <span aria-hidden="true" className="mt-1 block break-all text-xs leading-relaxed text-blue-800">{url}</span>}</span>
    <ArrowUpRight className="h-5 w-5 flex-none" aria-hidden="true" />
  </a>;
}
