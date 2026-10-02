import { useState, useEffect, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { API_URL, getFullApiUrl } from '../config';
import { listDraftBody, parseWebWishJournal, submitWishCreate } from '../lib/wishWeb';
import { pendingRequestKey, privatePendingStore } from '../lib/webPendingStore';
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "../components/ui/Card";
import { Plus, Search, X, Lock, Eye, EyeOff, Trash2, Gift, User, ExternalLink, Share2, Copy, Loader2 } from "lucide-react";
import { t } from "../utils/localization";
import { legacyPageText as pageText } from "../lib/legacyPageText";
import MarketplaceDialog from "../components/MarketplaceDialog";
import { legacyDeleteAck, legacyListOperation, legacyListText, legacyPrivacyAck, type LegacyListOperation } from '../lib/legacyWishlistWeb';

interface Wishlist {
    id: number;
    title: string;
    description: string | null;
    isPublic: boolean;
    _count?: {
        items: number;
    };
    items?: any[];
}

export default function WishlistDashboard() {
    const { token, user } = useAuth();
    const { userId } = useParams();
    if (userId && (!/^[1-9]\d{0,9}$/.test(userId) || Number(userId) > 2147483647)) return <p role="alert">{pageText('invalidOwner')}</p>;
    return <WishlistDashboardSession key={`${user?.id ?? 'public'}:${token ?? ''}:${userId ?? 'self'}`} />;
}

export function WishlistDashboardSession() {
    const { token, user } = useAuth();
    const { userId } = useParams();
    const navigate = useNavigate();
    // Logic: If userId is present, we are viewing someone else's profile (public).
    // If userId is missing, we are viewing our own dashboard (private).
    const isOwner = !userId;

    // Redirect to login if trying to view private dashboard without auth
    useEffect(() => {
        if (isOwner && !token) {
            navigate('/login');
        }
    }, [isOwner, token, navigate]);

    const [wishlists, setWishlists] = useState<Wishlist[]>([]);
    const [targetUserName, setTargetUserName] = useState(pageText('anonymous'));
    const [loading, setLoading] = useState(true);
    const [readError, setReadError] = useState('');
    const alive = useRef(true), lifetime = useRef(0), readSequence = useRef(0);
    useEffect(() => { alive.current = true; return () => { alive.current = false; lifetime.current++; }; }, []);
    const [creating, setCreating] = useState(false);
    const [createReady, setCreateReady] = useState(false), [createRecovery, setCreateRecovery] = useState(false);
    const creationGate = useRef(false), creationKey = useRef<string | null>(null);
    const [newTitle, setNewTitle] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [newIsPublic, setNewIsPublic] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState("newest"); // newest, oldest, name
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

    // Delete State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCreateExpanded, setIsCreateExpanded] = useState(false);
    const [listReady, setListReady] = useState(false), [listBusy, setListBusy] = useState(false);
    const [listPending, setListPending] = useState<string | null>(null), [listKnown, setListKnown] = useState(false), [listChecked, setListChecked] = useState(false);
    const [listIssue, setListIssue] = useState(''), [listNotice, setListNotice] = useState('');
    const listGate = useRef(false), listRaw = useRef<string | null>(null), listKey = useRef<string | null>(null), listReadyRef = useRef(false);
    async function restoreListOperation() {
        const generation = lifetime.current;
        try {
            if (!isOwner || !user || !token) return;
            const key = await pendingRequestKey(getFullApiUrl(), user.id, 'legacy-list-operation');
            const raw = await privatePendingStore.get(key);
            if (raw) legacyListOperation(raw);
            if (!alive.current || generation !== lifetime.current) return;
            listKey.current = key; listRaw.current = raw; setListPending(raw); setListKnown(false); setListChecked(false);
            listReadyRef.current = true; setListReady(true);
            setListIssue(raw ? legacyListText('pending') : '');
        } catch {
            if (alive.current && generation === lifetime.current) { listReadyRef.current = false; setListReady(false); setListIssue(legacyListText('storage')); }
        }
    }
    useEffect(() => { void restoreListOperation(); }, [isOwner, token, user?.id]);
    useEffect(() => {
        if (!isOwner || !token || !user) return;
        const generation = lifetime.current;
        void (async () => {
            try {
                const key = await pendingRequestKey(getFullApiUrl(), user.id, 'wish-create');
                const raw = await privatePendingStore.get(key); if (raw) parseWebWishJournal(raw);
                if (!alive.current || generation !== lifetime.current) return;
                creationKey.current = key; setCreateRecovery(raw !== null); setCreateReady(raw === null);
            } catch { if (alive.current && generation === lifetime.current) { setCreateRecovery(true); setFeedbackMessage(pageText('createStorage')); } }
        })();
    }, [isOwner, token, user?.id]);

    const handleDeleteClick = (id: number) => {
        if (!listReadyRef.current || listRaw.current || listGate.current || creationGate.current || readError) return;
        setDeleteId(id);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (deleteId) await mutateList({ version: 1, id: deleteId, kind: 'DELETE' });
    };

    const handleTogglePrivacy = async (id: number, currentStatus: boolean) => {
        await mutateList({ version: 1, id, kind: 'PRIVACY', wanted: !currentStatus });
    };

    async function clearListMarker(raw: string) {
        const stored = await privatePendingStore.get(listKey.current!);
        if (!alive.current) return;
        if (stored !== null && (stored !== raw || !await privatePendingStore.clear(listKey.current!, raw))) throw new Error('Marker changed');
    }
    async function mutateList(operation: LegacyListOperation) {
        if (!alive.current || !isOwner || !token || !user || !listReadyRef.current || listRaw.current || listGate.current || creationGate.current || readError) return;
        listGate.current = true; setListBusy(true); setIsDeleting(operation.kind === 'DELETE'); setListIssue(''); setListNotice('');
        const generation = lifetime.current, current = () => alive.current && generation === lifetime.current;
        // Local identity fences cleanup of a later identical intent; it is not a server receipt.
        const raw = JSON.stringify({ ...operation, localOperationId: crypto.randomUUID() }); let staged = false, confirmed = false;
        try {
            legacyListOperation(raw); await privatePendingStore.save(listKey.current!, raw); staged = true;
            if (!current()) return;
            listRaw.current = raw; setListPending(raw); setListChecked(false); setListKnown(false);
            // Invalidate reads already in flight before this mutation.
            readSequence.current++;
            const res = await fetch(API_URL + '/wishlists/' + operation.id, {
                method: operation.kind === 'DELETE' ? 'DELETE' : 'PUT',
                headers: { Authorization: 'Bearer ' + token, ...(operation.kind === 'PRIVACY' ? { 'Content-Type': 'application/json' } : {}) },
                ...(operation.kind === 'PRIVACY' ? { body: JSON.stringify({ isPublic: operation.wanted }) } : {}),
                cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000),
            });
            if (!current()) return;
            if ([400, 401, 403, 404].includes(res.status)) {
                await clearListMarker(raw); if (!current()) return;
                listRaw.current = null; setListPending(null); setDeleteModalOpen(false); setListIssue(legacyListText('denied')); return;
            }
            if (!res.ok) throw new Error('Unconfirmed operation');
            const ack: unknown = await res.json(); if (!current()) return;
            if (operation.kind === 'DELETE') legacyDeleteAck(ack, operation);
            else legacyPrivacyAck(ack, operation, user.id);
            confirmed = true; setListKnown(true); setListNotice(legacyListText('confirmed')); setDeleteModalOpen(false);
            setWishlists(old => operation.kind === 'DELETE' ? old.filter(row => row.id !== operation.id) : old.map(row => row.id === operation.id ? { ...row, isPublic: operation.wanted! } : row));
            await clearListMarker(raw); if (!current()) return;
            listRaw.current = null; setListPending(null); setListKnown(false);
        } catch {
            if (!current()) return;
            setDeleteModalOpen(false);
            if (!staged) { await restoreListOperation(); if (current()) setListIssue(legacyListText('storage')); }
            else setListIssue(legacyListText(confirmed ? 'cleanup' : 'unknown'));
        } finally { listGate.current = false; if (current()) { setListBusy(false); setIsDeleting(false); } }
    }
    async function readListOperation() {
        if (!listRaw.current || listGate.current) return;
        listGate.current = true; setListBusy(true); setListChecked(false);
        const generation = lifetime.current;
        try {
            const rows = await fetchWishlists();
            if (!alive.current || generation !== lifetime.current) return;
            setListChecked(!!rows); setListIssue(rows ? '' : legacyListText('readFailure'));
            if (rows) setListNotice(legacyListText('checked'));
        } finally { listGate.current = false; if (alive.current && generation === lifetime.current) setListBusy(false); }
    }
    async function acknowledgeListOperation() {
        if (!listRaw.current || listGate.current || !listKnown && !listChecked) return;
        listGate.current = true; setListBusy(true);
        const raw = listRaw.current, generation = lifetime.current;
        try {
            await clearListMarker(raw); if (!alive.current || generation !== lifetime.current) return;
            listRaw.current = null; setListPending(null); setListKnown(false); setListChecked(false); setListIssue('');
        } catch { if (alive.current && generation === lifetime.current) setListIssue(legacyListText('cleanup')); }
        finally { listGate.current = false; if (alive.current && generation === lifetime.current) setListBusy(false); }
    }

    const [maxCapacity, setMaxCapacity] = useState<number | null>(null);
    const capacitySequence = useRef(0);

    useEffect(() => {
        fetchWishlists();
        if (!isOwner && userId) {
            fetchTargetUser();
        } else if (isOwner) {
            fetchSelf();
        }
    }, [userId, token]);

    const fetchSelf = async () => {
        const generation = lifetime.current, sequence = ++capacitySequence.current;
        if (!token) return;
        setMaxCapacity(null);
        try {
            const url = API_URL + '/users/me';
            const res = await fetch(url, {
                headers: { 'Authorization': 'Bearer ' + token }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000)
            });
            if (res.ok) {
                const data = await res.json();
                // Dashboard creation uses nativeWishController's explicit 1–10000 bound.
                if (alive.current && generation === lifetime.current && sequence === capacitySequence.current && data.id === user?.id && typeof data.isPremium === 'boolean' && Number.isSafeInteger(data.maxWishlistItems) && data.maxWishlistItems >= 0 && data.maxWishlistItems <= 10000) setMaxCapacity(data.isPremium ? 10000 : Math.max(1, data.maxWishlistItems));
            }
        } catch { /* A profile read failure cannot manufacture a new capacity. */ }
    };

    const fetchTargetUser = async () => {
        const generation = lifetime.current;
        try {
            const url = API_URL + '/users/' + userId;
            const res = await fetch(url, {
                headers: token ? { 'Authorization': 'Bearer ' + token } : {}, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000)
            });
            if (res.ok) {
                const user = await res.json();
                if (alive.current && generation === lifetime.current && typeof user.name === 'string' && user.name.length <= 200) setTargetUserName(user.name);
            }
        } catch { /* The lists request shows the actionable read error. */ }
    };

    const fetchWishlists = async () => {
        const generation = lifetime.current, sequence = ++readSequence.current;
        const current = () => alive.current && generation === lifetime.current && sequence === readSequence.current;
        if (isOwner && !token) { if (current()) { setReadError(pageText('signInRead')); setLoading(false); } return; }
        setLoading(true); setReadError('');
        try {
            const url = !userId
                ? API_URL + '/wishlists'
                : API_URL + '/users/' + userId + '/wishlists';

            const res = await fetch(url, {
                headers: token ? { 'Authorization': 'Bearer ' + token } : {}, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000)
            });
            if (!res.ok) throw new Error('read failed');
            const data: unknown = await res.json();
            if (!Array.isArray(data)) throw new Error('invalid lists');
            const projected: Wishlist[] = data.map(row => {
                const count = row?._count?.items ?? (Array.isArray(row?.items) ? row.items.length : null);
                if (!row || !Number.isSafeInteger(row.id) || row.id < 1 || row.id > 2147483647 || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 200 || !(row.description == null || typeof row.description === 'string' && row.description.length <= 1000) || typeof row.isPublic !== 'boolean' || !Number.isSafeInteger(count) || count < 0) throw new Error('invalid list');
                return { id: row.id, title: row.title, description: row.description ?? null, isPublic: row.isPublic, _count: { items: count } };
            });
            if (new Set(projected.map(row => row.id)).size !== projected.length) throw new Error('duplicate lists');
            if (current()) { setWishlists(projected); return projected; }
        } catch {
            if (current()) setReadError(pageText('readFailed'));
        } finally {
            if (current()) setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createReady || creationGate.current || !creationKey.current || !token || !listReadyRef.current || listRaw.current || listGate.current || readError) return;
        const generation = lifetime.current, key = creationKey.current;
        const current = () => alive.current && generation === lifetime.current;
        creationGate.current = true;
        setCreating(true);
        let staged = false, confirmed = false;
        try {
            const payload = { clientRequestId: crypto.randomUUID(), ...listDraftBody(newTitle, newDescription, newIsPublic) };
            const raw = JSON.stringify({ kind: 'LIST', listId: null, body: JSON.stringify(payload) });
            await privatePendingStore.save(key, raw); staged = true;
            if (!current()) return;
            setCreateReady(false); setCreateRecovery(true);
            const receipt = await submitWishCreate(token, raw, privatePendingStore, key, current);
            if (!current()) return;
            if (receipt.kind !== 'LIST' || !receipt.resource || receipt.deleted) throw new Error('Invalid creation receipt');
            confirmed = true;
            const newList = receipt.resource;
            setWishlists(previous => [{ id: newList.id, title: newList.title, description: newList.description, isPublic: newList.isPublic, _count: { items: newList.count } }, ...previous.filter(list => list.id !== newList.id)]);
            setNewTitle(''); setNewDescription(''); setIsCreateExpanded(false);
            const stored = await privatePendingStore.get(key);
            if (stored !== null && (stored !== raw || !await privatePendingStore.clear(key, raw))) throw new Error('Unconfirmed local cleanup');
            if (current()) { setCreateRecovery(false); setCreateReady(true); setFeedbackMessage(pageText('created')); }
        } catch {
            if (current()) {
                if (staged) { setCreateReady(false); setCreateRecovery(true); }
                setFeedbackMessage(confirmed ? pageText('createCleanup') : staged ? pageText('createUnknown') : pageText('createInvalid'));
            }
        } finally {
            creationGate.current = false;
            if (current()) setCreating(false);
        }
    };

    const filteredWishlists = wishlists.filter(list =>
        list.title.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => {
        if (sortBy === 'name') return a.title.localeCompare(b.title);
        if (sortBy === 'oldest') return Number(a.id) - Number(b.id);
        return Number(b.id) - Number(a.id); // newest
    });

    if (loading) {
        return (
            <div className="container mx-auto p-4 space-y-8 [&_button]:min-h-11 [&_input:not([type=checkbox])]:min-h-11">
                <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-8" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-32 bg-gray-200 rounded animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    // Calculate Total Items
    const totalItems = wishlists.reduce((acc, list) => acc + (list._count?.items ?? list.items?.length ?? 0), 0);
    const writesBlocked = !listReady || listBusy || listPending !== null || !!readError || creating;

    return (
        <div className="container mx-auto p-4 space-y-8 [&_button]:min-h-11 [&_input:not([type=checkbox])]:min-h-11">
            {readError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800"><p>{readError}</p><Button onClick={() => void fetchWishlists()}>{pageText('readLists')}</Button></div>}
            {listIssue && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{listIssue}</p>}
            {listNotice && <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{listNotice}</p>}
            {isOwner && !listReady && <Button className="min-h-11" disabled={listBusy} onClick={() => void restoreListOperation()}>{legacyListText('recoveryTitle')}</Button>}
            {listPending && <section aria-label={legacyListText('recoveryTitle')} className="space-y-3 rounded-xl border bg-white p-4">
                <p>{legacyListText('pending')}</p>
                <div className="flex flex-wrap gap-3">
                    {!listKnown && <Button className="min-h-11" disabled={listBusy} onClick={() => void readListOperation()}>{legacyListText('read')}</Button>}
                    {(listKnown || listChecked) && <Button className="min-h-11" variant="outline" disabled={listBusy} onClick={() => void acknowledgeListOperation()}>{legacyListText(listKnown ? 'clean' : 'resume')}</Button>}
                </div>
            </section>}
            {isOwner && <Link className="inline-block rounded-xl border border-dashed border-green-600 bg-green-50 px-4 py-3 text-green-900" to="/wishes">{pageText('photoEntry')}</Link>}
            {createRecovery && <p role="alert">{pageText('pendingCreate')}<Link className="ml-2 inline-flex min-h-11 items-center underline" to="/wishes">{pageText('checkCreate')}</Link></p>}
            {/* Header / Dashboard Stats */}
            {isOwner && (
                <div className="grid grid-cols-1 mb-8">
                    <Card className="bg-muji-light border-none">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">{t('dashboard.totalItems')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-muji-primary">
                                {readError ? legacyListText('capacity') : totalItems} <span className="text-sm text-gray-400 font-normal">({t('dashboard.perList')}{' '}{pageText('capacity', { value: maxCapacity === null ? legacyListText('capacity') : maxCapacity.toLocaleString() })})</span>
                            </div>
                            {maxCapacity === null && <Button className="min-h-11 mt-3" variant="outline" onClick={() => void fetchSelf()}>{legacyListText('capacityRetry')}</Button>}
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-muji-primary">
                        {isOwner ? t('dashboard.myWishlists') : t('dashboard.userWishlists').replace('{name}', targetUserName)}
                    </h1>
                </div>

                {/* Search & Sort */}
                <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                            aria-label={pageText('search')}
                            placeholder={t('dashboard.searchPlaceholder') || "Search..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="min-h-11 pl-9 pr-12 text-base md:text-sm"
                        />
                        {searchQuery && (
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label={pageText('clearSearch')} className="absolute right-0 top-0 h-11 w-11 hover:bg-transparent"
                                onClick={() => setSearchQuery("")}
                            >
                                <X className="h-4 w-4 text-gray-400" />
                            </Button>
                        )}
                    </div>
                    <select aria-label={pageText('sort')}
                        className="min-h-11 min-w-0 max-w-[45%] rounded-md border border-muji-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muji-primary"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                    >
                        <option value="newest">{pageText('newest')}</option>
                        <option value="oldest">{pageText('oldest')}</option>
                        <option value="name">{pageText('name')}</option>
                    </select>
                </div>
            </div>

            {isOwner && (
                <div className="mb-8">
                    {!isCreateExpanded ? (
                        <Button
                            disabled={!createReady || writesBlocked}
                            onClick={() => setIsCreateExpanded(true)}
                            className="w-full md:w-auto border-dashed border-2 bg-transparent text-muji-primary hover:bg-gray-50 mb-4"
                            variant="outline"
                        >
                            + {t('dashboard.createNew')}
                        </Button>
                    ) : (
                        <Card className="animate-in slide-in-from-top-4 duration-300">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-xl">{t('dashboard.createTitle')}</CardTitle>
                                <Button variant="ghost" size="sm" aria-label={pageText('closeCreate')} className="min-h-11 min-w-11" disabled={creating} onClick={() => setIsCreateExpanded(false)}>
                                    ✕
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleCreate} className="space-y-4">
                                    <div>
                                        <Input
                                            aria-label={pageText('title')}
                                            placeholder={t('dashboard.titlePlaceholder')}
                                            value={newTitle}
                                            onChange={(e) => setNewTitle(e.target.value)}
                                            maxLength={50}
                                            required
                                            autoFocus
                                            disabled={writesBlocked}
                                        />
                                        <div className="text-right text-xs text-gray-400 mt-1">
                                            {newTitle.length}/50
                                        </div>
                                    </div>
                                    <Input
                                        aria-label={pageText('description')}
                                        placeholder={t('dashboard.descPlaceholder')}
                                        value={newDescription}
                                        onChange={(e) => setNewDescription(e.target.value)}
                                        maxLength={200}
                                        disabled={writesBlocked}
                                    />

                                    <div className="flex min-h-11 items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            id="newIsPublic"
                                            disabled={writesBlocked}
                                            checked={newIsPublic}
                                            onChange={(e) => setNewIsPublic(e.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-muji-primary focus:ring-muji-primary"
                                        />
                                        <label htmlFor="newIsPublic" className="inline-flex min-h-11 items-center text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            {t('dashboard.publicLabel')} - {newIsPublic ? t('dashboard.public') : t('dashboard.private')}
                                        </label>
                                    </div>

                                    <div className="flex justify-end gap-2">
                                        <Button type="button" variant="ghost" onClick={() => setIsCreateExpanded(false)}>
                                            {t('common.cancel')}
                                        </Button>
                                        <Button disabled={writesBlocked || !newTitle || !createReady}>
                                            {creating ? t('common.processing') : t('dashboard.createBtn')}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {loading && wishlists.length === 0 ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muji-primary" />
                </div>
            ) : filteredWishlists.length === 0 && !creating && !loading && !readError ? (
                <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-200">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Gift className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-1">{searchQuery ? pageText('noMatches') : t('dashboard.empty')}</h3>
                    <p className="text-gray-500 mb-6 max-w-sm mx-auto">{searchQuery ? pageText('changeSearch') : t(isOwner ? 'dashboard.emptyOwner' : 'dashboard.emptyVisitor')}</p>
                    {!searchQuery && isOwner && (
                        <Button disabled={!createReady || writesBlocked} onClick={() => setIsCreateExpanded(true)}>
                            {t('dashboard.createNew')}
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredWishlists.map((list) => (
                        <div key={list.id} onClick={event => { if (!(event.target as HTMLElement).closest('button') && !listBusy && !listPending) navigate('/wishlists/' + list.id); }}>
                            <Card className="hover:shadow-lg transition-shadow cursor-pointer group relative">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex justify-between items-start">
                                        <Link to={'/wishlists/' + list.id} className="inline-flex min-h-11 min-w-0 items-center break-words pr-4 underline-offset-4 hover:underline" onClick={e => e.stopPropagation()}>{list.title}</Link>
                                        {!list.isPublic && <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                                    </CardTitle>
                                    <CardDescription className="line-clamp-2 h-10">
                                        {list.description || t('dashboard.noDesc')}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-gray-500">
                                        {list._count?.items ?? list.items?.length ?? 0} {t('dashboard.items')}
                                    </p>
                                </CardContent>
                                <CardFooter className="flex justify-between items-center">
                                    <span className={"text-xs px-2 py-1 rounded " + (list.isPublic ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                                        {t(list.isPublic ? 'dashboard.public' : 'dashboard.private')}
                                    </span>
                                    {isOwner && (
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="min-h-11 min-w-11 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                                disabled={writesBlocked}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleTogglePrivacy(list.id, list.isPublic);
                                                }}
                                                title={list.isPublic ? pageText('makePrivate') : pageText('makePublic')}
                                                aria-label={list.isPublic ? pageText('makePrivate') : pageText('makePublic')}
                                            >
                                                {list.isPublic ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="min-h-11 min-w-11 text-red-400 hover:text-red-600 hover:bg-red-50"
                                                disabled={writesBlocked}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleDeleteClick(list.id);
                                                }}
                                                title={t('common.delete')}
                                                aria-label={t('common.delete')}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    )}
                                </CardFooter>
                            </Card>
                        </div>
                    ))
                    }
                </div >
            )}

            {deleteModalOpen && <MarketplaceDialog title={t('dashboard.deleteConfirmTitle') + ' · ' + (wishlists.find(row => row.id === deleteId)?.title ?? '')}
                closeLabel={t('common.cancel')} closeDisabled={isDeleting} onClose={() => { if (!listGate.current) setDeleteModalOpen(false); }}>
                <p className="mb-4">{t('dashboard.deleteConfirmMsg')}</p>
                <Button className="min-h-11" variant="destructive" disabled={isDeleting} onClick={() => void confirmDelete()}>{isDeleting ? t('common.processing') : t('common.delete')}</Button>
            </MarketplaceDialog>}

            {/* Mobile Create FAB */}
            {isOwner && !isCreateExpanded && (
                <Button
                    aria-label={pageText('createList')}
                    disabled={!createReady || writesBlocked}
                    className="md:hidden fixed bottom-24 right-6 h-14 w-14 rounded-full shadow-lg z-40 bg-muji-primary hover:bg-muji-secondary transition-all active:scale-95"
                    onClick={() => {
                        setIsCreateExpanded(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                >
                    <Plus className="h-6 w-6 text-white" />
                </Button>
            )}

            {/* Feedback Toast */}
            {feedbackMessage && (
                <div className="fixed bottom-24 md:bottom-10 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded shadow-lg z-50 text-sm animate-in fade-in slide-in-from-bottom-2">
                    {feedbackMessage}
                </div>
            )}
        </div>
    );
}
