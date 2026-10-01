import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "../components/ui/Card";
import MarketplaceDialog from "../components/MarketplaceDialog";
import { legacyDetail, detailEditAck, detailItemAck, detailText, type LegacyDetailItem as Item, type LegacyDetailList as Wishlist } from '../lib/legacyDetailWeb';
import { useLegacyDetailOperation } from '../lib/useLegacyDetailOperation';
import { legacyListText } from '../lib/legacyWishlistWeb';
import { Trash2, Edit2, Plus, Info, EyeOff, Eye, Link as LinkIcon, Image as ImageIcon, Gift, AlertCircle, UserPlus, Check, Share2 } from "lucide-react";
import { Link } from "react-router-dom";
import ItemDetailModal from "../components/ItemDetailModal";
import { API_URL } from '../config';
import DeleteConfirmModal from "../components/DeleteConfirmModal";
import { formatPriceWithConversion } from "../utils/currency";
import { getImageUrl } from "../utils/image";
import { t } from "../utils/localization";
import { Analytics } from "../utils/analytics";

export default function WishlistDetail() {
    const {id}=useParams(),{user,token}=useAuth();
    if(!id || !/^[1-9]\d{0,9}$/.test(id) || Number(id)>2147483647) return <p role="alert">{detailText('invalid')}</p>;
    return <WishlistDetailSession key={`${id}:${user?.id??'guest'}:${token??''}`} />;
}

export function WishlistDetailSession() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token, user } = useAuth();
    const [wishlist, setWishlist] = useState<Wishlist | null>(null);
    const [loading, setLoading] = useState(true);
    const [readError,setReadError]=useState('');
    const active=useRef(true),readSequence=useRef(0),lifetime=useRef(0);
    const operation=useLegacyDetailOperation(user?.id,token);
    useEffect(()=>{active.current=true;return()=>{active.current=false;lifetime.current++;readSequence.current++;};},[]);
    const canMutate=()=>active.current && !readError && operation.allowed();
    const [isEditing, setIsEditing] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editTitle, setEditTitle] = useState("");
    const [editDesc, setEditDesc] = useState("");
    const [editIsPublic, setEditIsPublic] = useState(false);
    const [copied, setCopied] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

    const handleShare = async () => {
        const shareData = {
            title: `Wishlist: ${wishlist?.title || 'Check this out'}`,
            text: `Check out my wishlist on Wishlist App!`,
            url: window.location.origin + window.location.pathname
        };

        // Try Native Share First (Mobile friendly)
        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
                Analytics.logShare('wishlist', wishlist?.id.toString());
                return; // Success, no need to copy
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
            }
        }

        // Fallback to Clipboard
        try {
            await navigator.clipboard.writeText(shareData.url);
            Analytics.logShare('wishlist', wishlist?.id.toString());
            setCopied(true);
            setFeedbackMessage(t('detail.linkCopied'));
            setTimeout(() => {
                setCopied(false);
                setFeedbackMessage(null);
            }, 2000);
        } catch (err) {
            console.error('Failed to copy', err);
            setFeedbackMessage(t('common.error'));
        }
    };

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ type: 'item' | 'wishlist', id?: number } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // FAB & Modal State
    const [isFabOpen, setIsFabOpen] = useState(false);
    const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
    const [urlInput, setUrlInput] = useState("");
    const [isSubmittingUrl, setIsSubmittingUrl] = useState(false);

    // Item Detail Modal State
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const pendingItemSignature = wishlist?.items
        .map(item => `${item.id}:${item.uploadStatus}:${item.aiStatus}`)
        .join('|') || '';

    useEffect(() => {
        fetchWishlist();
    }, [id, token]);

    // Separate useEffect for polling upload & AI status
    useEffect(() => {
        const hasPending = wishlist?.items.some(i =>
            i.uploadStatus === 'PENDING' ||
            i.uploadStatus === 'UPLOADING' ||
            i.aiStatus === 'PREPARING' ||
            i.aiStatus === 'PENDING' ||
            i.aiStatus === 'PROCESSING'
        );
        if (!hasPending || operation.busy || operation.pending || isEditModalOpen || isDetailOpen || readError) return;

        // Polling for upload & AI status - only when there are pending items
        const interval = setInterval(() => {
            if(document.visibilityState==='visible' && navigator.onLine) void fetchWishlist(true);
        }, 3000); // 3 seconds for faster feedback during upload

        return () => clearInterval(interval);
    }, [pendingItemSignature, id, operation.busy, operation.pending, isEditModalOpen, isDetailOpen, readError]);

    const fetchWishlist = async (silent = false):Promise<boolean> => {
        const sequence=++readSequence.current,version=lifetime.current;
        const current=()=>active.current && version===lifetime.current && sequence===readSequence.current;
        try {
            if (!silent) setLoading(true);
            const res = await fetch(`${API_URL}/wishlists/${id}`, { headers: token ? {Authorization:'Bearer '+token}:{}, cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000) });
            if(!current())return false;
            if(!res.ok) {
                setReadError(detailText(res.status===404?'missing':[401,403].includes(res.status)?'denied':'readError'));
                if([401,403,404].includes(res.status))setWishlist(null);
                return false;
            }
            const data=legacyDetail(await res.json(),Number(id));if(!current())return false;
            setWishlist(data);setReadError('');
            if(!silent){setEditTitle(data.title);setEditDesc(data.description);setEditIsPublic(data.isPublic);Analytics.logViewItemList(data.id.toString(),data.title);}
            return true;
        } catch {if(current())setReadError(detailText('readError'));return false;}
        finally {if(current() && !silent)setLoading(false);}
    };

    const handleUpdateWishlist = async () => {
        if(!canMutate() || !wishlist || user?.id!==wishlist.userId)return;
        const body={title:editTitle.trim(),description:editDesc,isPublic:editIsPublic};
        if(!body.title || body.title.length>200 || body.description.length>1000){setFeedbackMessage(detailText('editInvalid'));return;}
        readSequence.current++;
        await operation.run({id:wishlist.id,kind:'EDIT'},'/wishlists/'+wishlist.id,body,ack=>{
            const updated=detailEditAck(ack,wishlist,user.id,body);setWishlist(updated);setIsEditModalOpen(false);setIsEditing(false);setFeedbackMessage(t('common.saved'));
        });
    };

    // Item Actions
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if(!canMutate())return;
        setIsFabOpen(false);
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const formData = new FormData();
            formData.append('image', file);
            formData.append('language', navigator.language || 'en-US'); // Send client language

            try {
                const res = await fetch(`${API_URL}/wishlists/${id}/items`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                if (res.ok) {
                    fetchWishlist();
                    Analytics.logAddToWishlist('TWD', 0, [{ item_id: 'new_image_item', item_name: 'Image Upload Item' }]);
                }
            } catch (err) { console.error(err); }
        }
    };



    const handleUrlSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canMutate() || isSubmittingUrl) return;
        setIsSubmittingUrl(true);
        try {
            const res = await fetch(`${API_URL}/wishlists/${id}/items/url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ url: urlInput })
            });
            if (res.ok) {
                fetchWishlist();
                Analytics.logAddToWishlist('TWD', 0, [{ item_id: 'new_url_item', item_name: urlInput }]);
                setIsUrlModalOpen(false);
                setUrlInput("");
            } else {
                setFeedbackMessage(t('common.error'));
                setTimeout(() => setFeedbackMessage(null), 3000);
            }
        } catch (err) { console.error(err); }
        finally { setIsSubmittingUrl(false); }
    };

    const handleDeleteWishlist = () => {
        if(!canMutate())return;
        setDeleteTarget({ type: 'wishlist' });
        setDeleteModalOpen(true);
    };

    const handleDeleteItem = (itemId: number) => {
        if(!canMutate())return;
        setDeleteTarget({ type: 'item', id: itemId });
        setDeleteModalOpen(true);
    };

    const handleToggleStatus = async (item: Item) => {
        if(!token){navigate('/login?redirect='+encodeURIComponent('/wishlists/'+id));return;}
        if(!canMutate() || !wishlist)return;
        const wanted=!item.isPurchased;readSequence.current++;
        await operation.run({id:wishlist.id,kind:'PURCHASE',itemId:item.id,wanted},'/items/'+item.id,{isPurchased:wanted},ack=>{
            detailItemAck(ack,item.id,'isPurchased',wanted);
            setWishlist(old=>old?{...old,items:old.items.map(row=>row.id===item.id?{...row,isPurchased:wanted}:row)}:old);
            setFeedbackMessage(detailText(wanted?'purchased':'unmarked'));
        });
    };

    const executeDelete = async () => {
        if (!canMutate() || !deleteTarget) return;
        setIsDeleting(true);
        try {
            if (deleteTarget.type === 'wishlist') {
                const res = await fetch(`${API_URL}/wishlists/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    navigate('/dashboard');
                } else {
                    setFeedbackMessage(t('common.error'));
                    setTimeout(() => setFeedbackMessage(null), 3000);
                }
            } else if (deleteTarget.type === 'item' && deleteTarget.id) {
                const res = await fetch(`${API_URL}/items/${deleteTarget.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    fetchWishlist(true);
                    setDeleteModalOpen(false);
                } else {
                    const data = await res.json();
                    setFeedbackMessage(`Delete failed: ${data.error || res.statusText}`);
                    setTimeout(() => setFeedbackMessage(null), 3000);
                }
            }
        } catch (error: any) {
            setFeedbackMessage("Error executing delete: " + error.message);
            setTimeout(() => setFeedbackMessage(null), 3000);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleToggleHide = async (item: Item) => {
        if(!canMutate() || !wishlist || user?.id!==wishlist.userId)return;
        const wanted=!item.isHidden;readSequence.current++;
        await operation.run({id:wishlist.id,kind:'HIDE',itemId:item.id,wanted},'/items/'+item.id,{isHidden:wanted},ack=>{
            detailItemAck(ack,item.id,'isHidden',wanted);
            setWishlist(old=>old?{...old,items:old.items.map(row=>row.id===item.id?{...row,isHidden:wanted}:row)}:old);
        });
    };

    // Clone Modal State
    const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
    const [itemToClone, setItemToClone] = useState<Item | null>(null);
    const [myWishlists, setMyWishlists] = useState<Wishlist[]>([]);
    const [selectedTargetWishlistId, setSelectedTargetWishlistId] = useState<number | null>(null);

    const fetchMyWishlists = async () => {
        try {
            const res = await fetch(`${API_URL}/wishlists`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMyWishlists(data);
                if (data.length > 0) setSelectedTargetWishlistId(data[0].id);
            }
        } catch (err) { console.error(err); }
    };

    const handleCloneClick = (item: Item) => {
        if (!token) {
            // Guest guard
            if (confirm("Sign in to save this item to your wishlist!")) {
                navigate('/login?redirect=' + encodeURIComponent(window.location.pathname));
            }
            return;
        }

        setItemToClone(item);
        fetchMyWishlists(); // Load fresh list
        setIsCloneModalOpen(true);
    };

    const handleCloneConfirm = async () => {
        if (!canMutate() || !itemToClone || !selectedTargetWishlistId) return;

        try {
            const res = await fetch(`${API_URL}/items/${itemToClone.id}/clone`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ targetWishlistId: selectedTargetWishlistId })
            });
            if (res.ok) {
                setFeedbackMessage(t('detail.cloneSuccess'));
                setTimeout(() => setFeedbackMessage(null), 3000);
                setIsCloneModalOpen(false);
                setItemToClone(null);
            } else {
                const data = await res.json();
                setFeedbackMessage(data.error || t('common.error'));
                setTimeout(() => setFeedbackMessage(null), 3000);
            }
        } catch (err) { console.error(err); }
    };

    const openDetail = (item: Item) => {
        if(operation.busy || operation.pending)return;
        setSelectedItem(item);
        setIsDetailOpen(true);
    };

    const recovery=<section className="space-y-3" aria-label={legacyListText('recoveryTitle')}>
        {readError && <p role="alert">{readError}</p>}
        {operation.issue && <p role="alert">{operation.issue}</p>}
        {operation.notice && <p role="status">{operation.notice}</p>}
        {readError && <Button onClick={()=>void fetchWishlist()} disabled={operation.busy}>{detailText('retry')}</Button>}
        {operation.pending && operation.pending.id!==Number(id) ? <Link to={'/wishlists/'+operation.pending.id}>{detailText('original')}</Link> : operation.pending && <>
            <Button onClick={()=>void operation.check(()=>fetchWishlist())} disabled={operation.busy || operation.known}>{legacyListText('read')}</Button>
            <Button onClick={()=>void operation.acknowledge()} disabled={operation.busy || !operation.checked && !operation.known}>{legacyListText(operation.known?'clean':'resume')}</Button>
        </>}
        {!operation.ready && token && <Button onClick={()=>void operation.restore()} disabled={operation.busy}>{t('common.retry')}</Button>}
    </section>;
    if (loading && !wishlist) return <div className="p-4 text-center">{t('common.processing')}</div>;
    if (!wishlist) return <div className="p-4 space-y-4">{recovery}{!token && <Link to={'/login?redirect='+encodeURIComponent('/wishlists/'+id)}>{t('auth.login')}</Link>}</div>;

    const isOwner = user?.id === wishlist.userId;

    return (
        <div className="container mx-auto p-4 space-y-6 pb-24 relative min-h-screen">
            {recovery}
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
                <div className="space-y-2 flex-1">
                    {isEditing ? (
                        <div className="space-y-2 max-w-lg">
                            <label className="block text-sm font-medium text-gray-700">清單名稱
                                <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="為清單命名" />
                            </label>
                            <label className="block text-sm font-medium text-gray-700">清單說明（選填）
                                <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="公開清單會顯示" />
                            </label>

                            <div className="flex items-center gap-3 p-3 border rounded-lg border-dashed hover:bg-gray-50 transition-colors">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={editIsPublic}
                                        onChange={(e) => setEditIsPublic(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-muji-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-muji-primary"></div>
                                </label>
                                <span className="text-sm font-medium text-gray-700 select-none flex-1 cursor-pointer" onClick={() => setEditIsPublic(!editIsPublic)}>
                                    {t('dashboard.publicLabel')} - {editIsPublic ? t('dashboard.public') : t('dashboard.private')}
                                </span>
                            </div>

                            <div className="flex gap-2">
                                <Button onClick={handleUpdateWishlist} size="sm">{t('common.save')}</Button>
                                <Button variant="secondary" onClick={() => setIsEditing(false)} size="sm">{t('common.cancel')}</Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-3xl font-bold text-muji-primary">{wishlist.title}</h1>
                                <div
                                    onClick={handleShare}
                                    title={t('wishlist.share')}
                                >
                                    <Button variant="outline" size="sm" className={`min-h-11 gap-2 ${copied ? 'bg-green-50 text-green-600 border-green-200 font-medium' : ''}`}>
                                        {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                                        {copied ? t('detail.linkCopied') : t('wishlist.share')}
                                    </Button>
                                </div>
                                <span className="text-sm bg-gray-100 px-2 py-1 rounded text-gray-600">
                                    {wishlist.items.length}/{wishlist.maxItems ?? legacyListText('capacity')}
                                </span>
                            </div>
                            <p className="text-muji-secondary line-clamp-3">{wishlist.description}</p>
                        </>
                    )}
                </div>

                {isOwner && !isEditing && (
                    <div className="flex gap-2 self-end sm:self-start">
                        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={detailText('edit')} disabled={!canMutate()} onClick={() => {setEditTitle(wishlist.title);setEditDesc(wishlist.description);setEditIsPublic(wishlist.isPublic);setFeedbackMessage(null);setIsEditModalOpen(true);}}>
                            <Edit2 className="w-5 h-5 text-gray-600" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={t('wishlist.share')} onClick={() => handleShare()}>
                            {copied ? <Check className="w-5 h-5 text-green-600" /> : <Share2 className="w-5 h-5 text-gray-600" />}
                        </Button>
                        <Button variant="destructive" size="icon" className="h-11 w-11" aria-label={detailText('removeList')} disabled={!canMutate()} onClick={handleDeleteWishlist}>
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                )}
            </div>

            {/* Item List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {wishlist.items.map(item => {
                    const isProcessing = isOwner && (item.uploadStatus !== 'COMPLETED' || ['PREPARING', 'PENDING', 'PROCESSING'].includes(item.aiStatus));
                    const borderColor = !isOwner ? 'border-l-gray-200' : (item.uploadStatus === 'COMPLETED' && item.aiStatus === 'COMPLETED') ? 'border-l-green-500' :
                        item.aiStatus === 'SKIPPED' ? 'border-l-orange-500' :
                            isProcessing ? 'border-l-yellow-500' : 'border-l-red-500';

                    return (
                        <Card key={item.id} className={`overflow-hidden transition-opacity ${item.isHidden ? 'opacity-50' : 'opacity-100'} border-l-4 ${borderColor}`}>
                            <CardContent className="p-4 grid grid-cols-[80px_minmax(0,1fr)] gap-3 h-full">
                                {/* Image & Main Info */}
                                <div className="w-20 h-20 bg-gray-100 rounded flex-shrink-0 flex items-center justify-center relative overflow-hidden">
                                    {item.imageUrl ? (
                                        <img src={getImageUrl(item.imageUrl)} alt={item.name} className="w-full h-full object-cover" />
                                    ) : <span className="text-xs text-gray-400">No Img</span>}
                                    {isProcessing && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                            <span className="text-xs text-white font-bold animate-pulse">
                                                {item.uploadStatus === 'PENDING' || item.uploadStatus === 'UPLOADING'
                                                    ? '⬆️ Uploading...'
                                                    : item.aiStatus === 'PREPARING' ? '準備圖片…' : item.aiStatus === 'PENDING' ? 'AI 排隊中…' : t('ai.analyzing')}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="min-w-0 flex-1 flex flex-col justify-between">
                                    <div>
                                        <h3 className="font-semibold text-lg break-words">{item.name}</h3>
                                        <p className="text-red-500 font-medium">{item.price ? formatPriceWithConversion(item.price, item.currency || 'TWD') : '---'}</p>
                                        {item.maxPrice!==undefined && <p className="text-sm text-muji-secondary">{detailText('budget')}: {item.maxPrice.toLocaleString(undefined,{maximumFractionDigits:2})} {item.priceCurrency || 'TWD'}</p>}
                                    </div>
                                    {isOwner && <div className="text-xs text-gray-500">
                                        {item.uploadStatus === 'FAILED' ? (
                                            <span className="text-red-600">Upload Failed</span>
                                        ) : item.uploadStatus === 'PENDING' || item.uploadStatus === 'UPLOADING' ? (
                                            <span className="text-blue-600 animate-pulse">⬆️ Uploading...</span>
                                        ) : item.aiStatus === 'COMPLETED' ? (
                                            <span className="text-green-600">{t('ai.complete')}</span>
                                        ) : item.aiStatus === 'FAILED' ? (
                                            <span className="text-red-600">{t('ai.failed')}</span>
                                        ) : item.aiStatus === 'SKIPPED' ? (
                                            <span className="text-orange-600">傳統模式</span>
                                        ) : item.aiStatus === 'PREPARING' ? (
                                            <span className="text-blue-600 animate-pulse">準備圖片…</span>
                                        ) : item.aiStatus === 'PENDING' ? (
                                            <span className="text-yellow-600 animate-pulse">EClaw 排隊中…</span>
                                        ) : item.aiStatus === 'PROCESSING' ? (
                                            <span className="text-yellow-600 animate-pulse">EClaw 辨識中…</span>
                                        ) : (
                                            <span className="text-yellow-600">{t('ai.analyzing')}...</span>
                                        )}
                                    </div>}
                                </div>

                                {/* Actions Column - More compact */}
                                <div className="col-span-2 flex gap-1 items-center justify-end border-t pt-2">
                                    {isOwner ? (
                                        <>
                                            <Button variant="ghost" size="icon" aria-label={detailText('info')+' '+item.name} disabled={operation.busy || !!operation.pending} className="h-11 w-11 text-blue-600 hover:bg-blue-50" onClick={() => openDetail(item)}>
                                                <Info className="w-5 h-5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" aria-label={detailText(item.isHidden?'show':'hide')+' '+item.name} disabled={!canMutate()} className="h-11 w-11 text-gray-500 hover:bg-gray-100" onClick={() => handleToggleHide(item)}>
                                                {item.isHidden ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </Button>
                                            <Button variant="ghost" size="icon" aria-label={detailText('remove')+' '+item.name} disabled={!canMutate()} className="h-11 w-11 text-red-500 hover:bg-red-50" onClick={() => handleDeleteItem(item.id)}>
                                                <Trash2 className="w-5 h-5" />
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <div title={detailText(item.isPurchased?'available':'purchase')} className={`w-3 h-3 rounded-full ${item.isPurchased ? 'bg-green-500' : 'bg-gray-300'}`} />
                                            <Button variant="ghost" size="icon" disabled={!!token && !canMutate()} aria-label={detailText(item.isPurchased?'available':'purchase')+' '+item.name} className={`h-11 w-11 ${item.isPurchased ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-green-600'}`} onClick={() => handleToggleStatus(item)} title={detailText(item.isPurchased?'available':'purchase')}>
                                                <Gift className="w-5 h-5 font-bold" />
                                            </Button>
                                            <Button variant="ghost" size="icon" aria-label={detailText('clone')+' '+item.name} disabled={!!token && !canMutate()} className="h-11 w-11 text-red-600 hover:bg-red-50" onClick={() => handleCloneClick(item)}>
                                                <Plus className="w-5 h-5 font-bold" />
                                            </Button>
                                            <Button variant="ghost" size="icon" aria-label={detailText('info')+' '+item.name} disabled={operation.busy || !!operation.pending} className="h-11 w-11 text-blue-600 hover:bg-blue-50" onClick={() => openDetail(item)} title="View Info">
                                                <Info className="w-5 h-5" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}

                {/* Empty State */}
                {wishlist.items.length === 0 && (
                    <div className="col-span-full py-12 text-center text-muji-secondary bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                        <Gift className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p className="text-lg font-medium">{isOwner ? t('wishlist.emptyOwner') : t('wishlist.emptyVisitor')}</p>
                    </div>
                )}
            </div>

            {/* FAB & Menu */}
            {
                isOwner && (
                    <div className="fixed bottom-24 md:bottom-8 right-8 z-20 flex flex-col items-end gap-3">
                        {/* Menu Options */}
                        {isFabOpen && (
                            <div className="flex flex-col gap-2 animate-in slide-in-from-bottom-5 fade-in duration-200">
                                <div className="flex items-center gap-2 justify-end">
                                    <span className="bg-white px-3 py-1.5 rounded-full shadow-md text-sm font-medium text-gray-700">{t('detail.addUrl')}</span>
                                    <Button
                                        aria-label={t('detail.addUrl')}
                                        className="rounded-full w-12 h-12 shadow-lg bg-blue-600 hover:bg-blue-700 text-white p-0"
                                        onClick={() => { setIsFabOpen(false); setIsUrlModalOpen(true); }}
                                    >
                                        <LinkIcon className="w-5 h-5" />
                                    </Button>
                                </div>
                                <div className="flex items-center gap-2 justify-end">
                                    <span className="bg-white px-3 py-1.5 rounded-full shadow-md text-sm font-medium text-gray-700">{t('detail.uploadImg')}</span>
                                    <Button
                                        aria-label={t('detail.uploadImg')}
                                        className="rounded-full w-12 h-12 shadow-lg bg-green-600 hover:bg-green-700 text-white p-0"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <ImageIcon className="w-5 h-5" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Main FAB */}
                        <Button
                            aria-label={t('common.add')}
                            disabled={!canMutate()}
                            className={`rounded-full w-14 h-14 shadow-xl text-white flex items-center justify-center p-0 transition-transform duration-200 ${isFabOpen ? 'bg-red-500 hover:bg-red-600 rotate-45' : 'bg-stone-800 hover:bg-stone-700'}`}
                            onClick={() => setIsFabOpen(!isFabOpen)}
                        >
                            <Plus className="w-8 h-8" />
                        </Button>

                        <input
                            type="file"
                            ref={fileInputRef}
                            hidden
                            accept="image/*"
                            onChange={handleFileUpload}
                        />
                    </div>
                )
            }

            {/* URL Input Modal */}
            {
                isUrlModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <Card className="w-full max-w-md bg-white">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2">
                                    <LinkIcon className="w-5 h-5 text-muji-primary" />
                                    {t('detail.addItemTitle')}
                                </CardTitle>
                            </CardHeader>
                            <form onSubmit={handleUrlSubmit}>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-700">{t('detail.itemLabel')}</label>
                                        <Input
                                            placeholder={t('detail.itemPlaceholder')}
                                            value={urlInput}
                                            onChange={e => setUrlInput(e.target.value)}
                                            required
                                            autoFocus
                                            className="h-11"
                                            type="url"
                                            inputMode="url"
                                        />
                                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex gap-3 items-start">
                                            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                            <div className="text-sm text-blue-800">
                                                <p className="font-semibold mb-0.5">Tip</p>
                                                {t('detail.smartInputTip')}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="flex justify-end gap-2 bg-gray-50 pt-4 pb-4 px-6 rounded-b-xl">
                                    <Button variant="secondary" type="button" onClick={() => setIsUrlModalOpen(false)} disabled={isSubmittingUrl}>{t('common.cancel')}</Button>
                                    <Button type="submit" disabled={isSubmittingUrl}>
                                        {isSubmittingUrl ? t('common.loading') : t('common.add')}
                                    </Button>
                                </CardFooter>
                            </form>
                        </Card>
                    </div>
                )
            }

            {/* Detail Modal */}
            {
                selectedItem && (
                    <ItemDetailModal
                        isOpen={isDetailOpen}
                        onClose={() => setIsDetailOpen(false)}
                        item={wishlist.items.find(item=>item.id===selectedItem.id) ?? selectedItem}
                        onUpdate={() => fetchWishlist(true)}
                        wisherName={selectedItem.originalUser?.name || wishlist.user?.name || "User"}
                        wisherId={selectedItem.originalUser?.id || wishlist.userId}
                        isOwner={isOwner}
                    />
                )
            }

            {/* Clone Selection Modal */}
            {
                isCloneModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <Card className="w-full max-w-sm bg-white">
                            <CardHeader>
                                <CardTitle>{t('detail.cloneTitle')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-sm text-gray-600">{t('detail.cloneDesc')}</p>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {myWishlists.length > 0 ? myWishlists.map(wl => (
                                        <div
                                            key={wl.id}
                                            className={`p-3 rounded border cursor-pointer flex items-center justify-between ${selectedTargetWishlistId === wl.id ? 'border-muji-primary bg-stone-50' : 'border-gray-200 hover:bg-gray-50'}`}
                                            onClick={() => setSelectedTargetWishlistId(wl.id)}
                                        >
                                            <span className="font-medium text-sm truncate">{wl.title}</span>
                                            {selectedTargetWishlistId === wl.id && <div className="w-2 h-2 rounded-full bg-muji-primary" />}
                                        </div>
                                    )) : (
                                        <p className="text-sm text-red-500">{t('dashboard.emptyOwner')}</p>
                                    )}
                                </div>
                            </CardContent>
                            <CardFooter className="flex justify-end gap-2">
                                <Button variant="secondary" onClick={() => setIsCloneModalOpen(false)}>{t('common.cancel')}</Button>
                                <Button onClick={handleCloneConfirm} disabled={!selectedTargetWishlistId}>{t('detail.cloneConfirm')}</Button>
                            </CardFooter>
                        </Card>
                    </div>
                )
            }
            {/* Edit Wishlist Modal */}
            {isEditModalOpen && <MarketplaceDialog title={detailText('edit')} onClose={()=>setIsEditModalOpen(false)} closeDisabled={operation.busy} closeLabel={t('common.close')}>
                <div className="space-y-4">
                    <label className="block">{detailText('title')}<Input value={editTitle} maxLength={200} onChange={e=>setEditTitle(e.target.value)} disabled={operation.busy || !!operation.pending}/></label>
                    <label className="block">{detailText('description')}<Input value={editDesc} maxLength={1000} onChange={e=>setEditDesc(e.target.value)} disabled={operation.busy || !!operation.pending}/></label>
                    <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={editIsPublic} onChange={e=>setEditIsPublic(e.target.checked)} disabled={operation.busy || !!operation.pending}/>{detailText('public')}</label>
                    <Button className="min-h-11 w-full" onClick={handleUpdateWishlist} disabled={!canMutate()}>{t('common.save')}</Button>
                    {(operation.issue || operation.notice) && <p role="status">{operation.issue || operation.notice}</p>}
                </div>
            </MarketplaceDialog>}

            {/* Delete Confirmation Modal */}
            <DeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={executeDelete}
                title={deleteTarget?.type === 'wishlist' ? t('detail.deleteWishlistTitle') : t('detail.deleteItemTitle')}
                message={deleteTarget?.type === 'item' ? t('detail.deleteItemConfirm') : t('dashboard.deleteConfirmMsg')}
                isDeleting={isDeleting}
            />

            {/* Guest CTA Banner */}
            {
                !token && (
                    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-40 flex items-center justify-between pb-8 md:pb-4">
                        <div className="flex-1 mr-4">
                            <p className="font-bold text-muji-primary text-sm sm:text-base">Love this list?</p>
                            <p className="text-xs text-muji-secondary">Join Wishlist.ai to create your own collection.</p>
                        </div>
                        <Link to="/register">
                            <Button className="bg-muji-primary hover:bg-stone-800 text-white shadow-lg">
                                <UserPlus className="w-4 h-4 mr-2" />
                                Join Now
                            </Button>
                        </Link>
                    </div>
                )
            }
            {/* Feedback Toast */}
            {
                feedbackMessage && !operation.pending && (
                    <div role="status" className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded shadow-lg z-50 text-sm animate-in fade-in slide-in-from-bottom-2">
                        {feedbackMessage}
                    </div>
                )
            }
            {!token && <div className="h-24 md:hidden"></div>} {/* Spacer for guest banner */}
        </div >
    );
}
