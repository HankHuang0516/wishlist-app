import { useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { socialAvatar } from '../lib/socialWeb';
import { t } from '../utils/localization';

type Props = { url: string | null; name: string; fallback: ReactNode; compact?: boolean };

export default function SocialAvatar({ url, name, fallback, compact = true }: Props) {
    const [attempt, setAttempt] = useState(0);
    if (!url) return <>{fallback}</>;
    return <PhotoAttempt key={`${url}:${attempt}`} url={url} name={name} compact={compact} retry={() => setAttempt(value => value + 1)} />;
}

function PhotoAttempt({ url, name, compact, retry }: { url: string; name: string; compact: boolean; retry: () => void }) {
    const [failed, setFailed] = useState(false);
    if (!failed) return <img src={socialAvatar(url)} referrerPolicy="no-referrer" alt={name} className="h-full w-full object-cover" onError={() => setFailed(true)} />;
    return <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-gray-500">
        <span className={compact ? 'sr-only' : 'text-xs text-center'}>{t('friend.photoReadFailed')}</span>
        <button type="button" title={t('friend.photoReadFailed')} aria-label={`${t('friend.retryPhoto')} · ${name}`} className="inline-flex min-h-11 min-w-11 flex-col items-center justify-center rounded text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-stone-700" onClick={retry}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span className={compact ? 'text-[10px] leading-tight' : ''}>{t('friend.retryPhoto')}</span>
        </button>
    </div>;
}
