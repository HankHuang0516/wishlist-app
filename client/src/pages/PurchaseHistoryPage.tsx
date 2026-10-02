import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Gift, ExternalLink, ShoppingBag } from 'lucide-react';
import { HistoryReadError, historyImage, historyLink, parseAccountHistory, parseClaimHistory, readHistory, type AccountTransaction, type ClaimedItem } from '../lib/purchaseHistoryWeb';
import { historyText as ht, historyLocale } from '../lib/purchaseHistoryCopy';

type Reading<T> = { phase: 'loading' } | { phase: 'error'; authentication: boolean } | { phase: 'ready'; data: T };
function useHistory<T>(kind: 'account' | 'claims', token: string, parse: (raw: unknown) => T) {
    const [reading, setReading] = useState<Reading<T>>({ phase: 'loading' });
    const alive = useRef(false), sequence = useRef(0), controller = useRef<AbortController | null>(null), busy = useRef(false);
    const retry = useCallback(async () => {
        if (!alive.current || busy.current) return;
        busy.current = true; const revision = ++sequence.current;
        controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
        const current = () => alive.current && sequence.current === revision && !abort.signal.aborted;
        setReading({ phase: 'loading' });
        try { const data = await readHistory(kind, token, abort.signal, parse); if (current()) setReading({ phase: 'ready', data }); }
        catch (error) { if (current()) setReading({ phase: 'error', authentication: error instanceof HistoryReadError && error.authentication }); }
        finally { if (alive.current && sequence.current === revision) busy.current = false; }
    }, [kind, token, parse]);
    useEffect(() => { alive.current = true; void retry(); return () => { alive.current = false; sequence.current++; busy.current = false; controller.current?.abort(); }; }, [retry]);
    return { reading, retry };
}
const linkClass = 'inline-flex min-h-11 items-center justify-center rounded-md border border-muji-border px-4 py-2 text-sm text-muji-primary hover:bg-muji-bg';
function ReadNotice({ reading, retry, kind }: { reading: Reading<unknown>; retry: () => void; kind: 'account' | 'claims' }) {
    if (reading.phase === 'loading') return <p role="status" className="rounded-lg border bg-white p-4 text-gray-600">{ht('正在讀取紀錄…')}</p>;
    if (reading.phase !== 'error') return null;
    return <div className="space-y-3 rounded-lg border bg-white p-4"><p role="alert">{ht(reading.authentication ? '登入或權限已失效，請重新登入後核對。' : '無法讀取紀錄；不代表沒有紀錄。')}</p>
        {reading.authentication && <Link className={linkClass} to="/login?next=%2Fpurchase-history">{ht('登入後查看紀錄')}</Link>}
        <Button variant="outline" className="min-h-11" onClick={retry}>{ht(kind === 'account' ? '重試讀取帳號交易' : '重試讀取送禮認領')}</Button></div>;
}
function transactionType(value: string) {
    return value === 'PREMIUM' ? ht('尊榮版訂閱') : value === 'LIMIT_WISHLIST' ? ht('清單容量擴充') : value === 'LIMIT_FOLLOWING' ? ht('追蹤人數擴充') : ht('其他交易') + ' · ' + value;
}
function TransactionStatus({ status }: { status: string }) {
    const labels = { COMPLETED: ht('完成'), PENDING: ht('處理中'), FAILED: ht('失敗'), CANCELLED: ht('已取消'), REFUNDED: ht('已退款') };
    const classes = status === 'COMPLETED' ? 'bg-green-100 text-green-800' : status === 'FAILED' ? 'bg-red-50 text-red-800' : 'bg-gray-100 text-gray-700';
    return <span className={`inline-block rounded-full px-2 py-1 text-xs break-words ${classes}`}>{Object.hasOwn(labels, status) ? labels[status as keyof typeof labels] : ht('其他狀態') + ' · ' + status}</span>;
}
const when = (iso: string) => new Date(iso).toLocaleString(historyLocale());
function Transactions({ rows }: { rows: AccountTransaction[] }) {
    if (!rows.length) return <p className="rounded-lg border bg-white p-6 text-center text-gray-500">{ht('沒有帳號交易紀錄')}</p>;
    return <><div className="space-y-3 md:hidden">{rows.map(row => <article key={row.id} className="space-y-2 rounded-lg border bg-white p-4">
        <h3 className="break-words font-medium">{transactionType(row.type)}</h3><time dateTime={row.createdAt} className="block text-sm text-gray-500">{when(row.createdAt)}</time>
        <p className="break-words font-mono">{row.currency} {String(row.amount)}</p><TransactionStatus status={row.status} /></article>)}</div>
        <div className="hidden overflow-x-auto rounded-lg border bg-white md:block"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr>{(['項目','日期','金額','狀態'] as const).map(label => <th scope="col" key={label} className="p-4">{ht(label)}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t"><td className="break-words p-4">{transactionType(row.type)}</td><td className="p-4"><time dateTime={row.createdAt}>{when(row.createdAt)}</time></td><td className="break-words p-4 font-mono">{row.currency} {String(row.amount)}</td><td className="p-4"><TransactionStatus status={row.status} /></td></tr>)}</tbody></table></div></>;
}
function Claim({ row }: { row: ClaimedItem }) {
    if (row.unavailable) return <article className="space-y-2 rounded-lg border bg-gray-50 p-4"><h3>{ht('此認領願望目前不可閱覽')}</h3><p className="text-sm text-gray-600">{ht('對方已隱藏願望或將清單設為私人；紀錄不授予閱覽權限。')}</p><time className="block text-xs text-gray-500" dateTime={row.updatedAt}>{when(row.updatedAt)}</time></article>;
    const photo = historyImage(row.imageUrl), link = historyLink(row.link);
    return <article className="overflow-hidden rounded-lg border bg-white"><div className="flex gap-3 p-4"><div className="h-20 w-20 shrink-0 overflow-hidden rounded bg-gray-100">
        {photo ? <img src={photo} alt={row.name} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <Gift aria-hidden="true" className="m-6 h-8 w-8 text-gray-400" />}</div>
        <div className="min-w-0 flex-1 space-y-2"><h3 className="break-words font-semibold">{row.name}</h3><p className="break-words text-sm">{row.price !== null ? `${row.currency ?? ''} ${row.price}` : ht('未提供參考價格')}</p>
        <p className="break-words text-sm text-gray-600">{row.wishlist.title || ht('未命名清單')}</p><p className="break-words text-xs text-gray-500">{ht('願望所屬使用者')}：{row.wishlist.user.nicknames || row.wishlist.user.name || ht('未命名使用者')}</p></div></div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2"><time className="text-xs text-gray-500" dateTime={row.updatedAt}>{when(row.updatedAt)}</time>
        {link ? <a className={linkClass} href={link} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{ht('開啟原商品連結')}<ExternalLink aria-hidden="true" className="ml-2 h-4 w-4" /></a> : row.link ? <p className="text-xs text-gray-500">{ht('連結目前不可開啟')}</p> : null}</div></article>;
}
function PurchaseHistorySession({ token }: { token: string }) {
    const account = useHistory('account', token, parseAccountHistory), claims = useHistory('claims', token, parseClaimHistory);
    return <div className="mx-auto max-w-4xl space-y-8 py-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{ht('交易與送禮紀錄')}</h1><Link className={linkClass} to="/settings">{ht('返回設定')}</Link></div>
        <section aria-labelledby="account-history-title" className="space-y-4"><h2 id="account-history-title" className="flex items-center gap-2 text-xl font-semibold"><ShoppingBag aria-hidden="true" className="h-6 w-6" />{ht('帳號交易紀錄')}</h2><p className="text-sm text-gray-600">{ht('目前未開放新的購買與訂閱；這裡保留既有帳號紀錄。')}</p><ReadNotice {...account} kind="account" />{account.reading.phase === 'ready' && <Transactions rows={account.reading.data} />}</section>
        <section aria-labelledby="claim-history-title" className="space-y-4"><h2 id="claim-history-title" className="flex items-center gap-2 text-xl font-semibold"><Gift aria-hidden="true" className="h-6 w-6" />{ht('送禮認領紀錄')}</h2><p className="text-sm text-gray-600">{ht('這是目前仍由你認領的願望，不是付款或送達證明。清單刪除或取消認領後可能不再列出。')}</p><ReadNotice {...claims} kind="claims" />{claims.reading.phase === 'ready' && (claims.reading.data.length ? claims.reading.data.map(row => <Claim key={row.id} row={row} />) : <p className="rounded-lg border bg-white p-6 text-center text-gray-500">{ht('目前沒有送禮認領')}</p>)}</section></div>;
}
export default function PurchaseHistoryPage() {
    const { user, token } = useAuth();
    if (!token || !user) return <div className="space-y-4 py-6"><h1 className="text-2xl font-bold">{ht('交易與送禮紀錄')}</h1><Link className={linkClass} to="/login?next=%2Fpurchase-history">{ht('登入後查看紀錄')}</Link></div>;
    return <PurchaseHistorySession key={`${user.id}:${token}`} token={token} />;
}
