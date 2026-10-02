import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardContent } from "../components/ui/Card";
import MarketplaceDialog from "../components/MarketplaceDialog";
import { legacyDetail, detailEditAck, detailItemAck, detailText, detailItemBody, detailItemEditAck, detailDeletedAck, detailCloneAck, detailCloneTargets, detailItemText, type DetailItemDraft, type LegacyDetailItem as Item, type LegacyDetailList as Wishlist } from '../lib/legacyDetailWeb';
import { useLegacyDetailOperation } from '../lib/useLegacyDetailOperation';
import { prepareLegacyCreate,legacyCreateAck,createText } from '../lib/legacyWishCreateWeb';
import { useLegacyWishPhoto } from '../lib/useLegacyWishPhoto';
import LegacyWishPhotoRecovery from '../components/LegacyWishPhotoRecovery';
import PrivatePhoto from '../components/PrivateMarketplacePhoto';
import { legacyListText } from '../lib/legacyWishlistWeb';
import { Trash2, Edit2, Plus, Info, EyeOff, Eye, Link as LinkIcon, Image as ImageIcon, Gift, UserPlus, Check, Share2 } from "lucide-react";
import { Link } from "react-router-dom";
import ItemDetailModal from "../components/ItemDetailModal";
import { API_URL } from '../config';
import { formatPriceWithConversion } from "../utils/currency";
import { getImageUrl } from "../utils/image";
import { t } from "../utils/localization";
import { legacyPageText as pageText } from "../lib/legacyPageText";
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
    const [readError,setReadError]=useState(''),[deleted,setDeleted]=useState(false);
    const active=useRef(true),readSequence=useRef(0),lifetime=useRef(0);
    const operation=useLegacyDetailOperation(user?.id,token);
    useEffect(()=>{active.current=true;return()=>{active.current=false;lifetime.current++;readSequence.current++;};},[]);
    const photo=useLegacyWishPhoto(user?.id,token,Number(id));
    const preparing=useRef(false);
    const canMutate=()=>active.current && !readError && !preparing.current && operation.allowed() && photo.allowed();
    const [isEditing, setIsEditing] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editTitle, setEditTitle] = useState("");
    const [editDesc, setEditDesc] = useState("");
    const [editIsPublic, setEditIsPublic] = useState(false);
    const [copied, setCopied] = useState(false);
    const [shareBusy, setShareBusy] = useState(false), [shareUrl, setShareUrl] = useState('');
    const shareGate = useRef(false), shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (shareTimer.current) clearTimeout(shareTimer.current); }, []);
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

    const handleShare = async () => {
        if (!active.current || !wishlist || shareGate.current) return;
        shareGate.current = true; setShareBusy(true); setCopied(false); setShareUrl('');
        if (shareTimer.current) clearTimeout(shareTimer.current);
        const version = lifetime.current, current = () => active.current && version === lifetime.current;
        const shareData = {
            title: pageText('shareTitle', { title: wishlist.title }),
            text: pageText('shareMessage'),
            url: window.location.origin + '/wishlists/' + wishlist.id
        };
        try {
            // Support browsers with share but no canShare. Capability failures
            // still leave the existing clipboard/manual URL alternative usable.
            let native = false;
            try { native = !!navigator.share && (!navigator.canShare || navigator.canShare(shareData)); } catch { /* use copy */ }
            if (native) {
                try {
                    await navigator.share(shareData);
                    if (current()) Analytics.logShare('wishlist', wishlist.id.toString());
                    return;
                } catch (err) {
                    if (!current() || err instanceof DOMException && err.name === 'AbortError') return;
                }
            }
            if (!current()) return;
            try {
                await navigator.clipboard.writeText(shareData.url);
                if (!current()) return;
                Analytics.logShare('wishlist', wishlist.id.toString());
                setCopied(true); setFeedbackMessage(t('detail.linkCopied'));
                shareTimer.current = setTimeout(() => {
                    if (current()) { setCopied(false); setFeedbackMessage(null); }
                }, 2000);
            } catch {
                if (current()) setShareUrl(shareData.url);
            }
        } finally { shareGate.current = false; if (current()) setShareBusy(false); }
    };

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ type: 'item' | 'wishlist', id?: number } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // FAB & Modal State
    const [isFabOpen, setIsFabOpen] = useState(false);
    const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
    const [urlInput, setUrlInput] = useState("");
    const [isSubmittingUrl, setIsSubmittingUrl] = useState(false);
    const [createKind,setCreateKind]=useState<'LINK'|'PHOTO'>('LINK');
    const emptyDraft:DetailItemDraft={name:'',notes:'',link:'',price:'',currency:'TWD',budget:'',budgetCurrency:'TWD'};
    const [createDraft,setCreateDraft]=useState<DetailItemDraft>(emptyDraft);
    const [createIssue,setCreateIssue]=useState('');
    const cameraInputRef=useRef<HTMLInputElement>(null);
    const canCreate=()=>active.current && !readError && !preparing.current && operation.allowed() && (createKind==='PHOTO'?photo.usable():photo.allowed());
    const openCreate=(kind:'LINK'|'PHOTO')=>{if(!active.current || readError || !operation.allowed() || preparing.current || !(kind==='PHOTO'?photo.allowed() || photo.usable():photo.allowed()))return;setIsFabOpen(false);setCreateKind(kind);setCreateIssue('');setIsUrlModalOpen(true);};

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
        if (!hasPending || operation.busy || operation.pending || isEditModalOpen || isDetailOpen || isUrlModalOpen || photo.busy || photo.raw || readError) return;

        // Polling for upload & AI status - only when there are pending items
        const interval = setInterval(() => {
            if(document.visibilityState==='visible' && navigator.onLine) void fetchWishlist(true);
        }, 3000); // 3 seconds for faster feedback during upload

        return () => clearInterval(interval);
    }, [pendingItemSignature, id, operation.busy, operation.pending, isEditModalOpen, isDetailOpen, isUrlModalOpen, photo.busy, photo.raw, readError]);

    const fetchWishlist = async (silent = false,allowMissing=false):Promise<boolean> => {
        const sequence=++readSequence.current,version=lifetime.current;
        const current=()=>active.current && version===lifetime.current && sequence===readSequence.current;
        try {
            if (!silent) setLoading(true);
            const res = await fetch(`${API_URL}/wishlists/${id}`, { headers: token ? {Authorization:'Bearer '+token}:{}, cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000) });
            if(!current())return false;
            if(!res.ok) {
                setReadError(detailText(res.status===404?'missing':[401,403].includes(res.status)?'denied':'readError'));
                if([401,403,404].includes(res.status))setWishlist(null);
                return res.status===404 && allowMissing;
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
        const file=e.target.files?.[0];e.target.value='';
        if(!file || !operation.allowed() || readError || !active.current)return;
        await photo.upload(file);
    };
    const handleUrlSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!canCreate() || !wishlist || user?.id!==wishlist.userId)return;
        preparing.current=true;setIsSubmittingUrl(true);setCreateIssue('');
        const version=lifetime.current,current=()=>active.current && version===lifetime.current;
        try {
            const prepared=await prepareLegacyCreate(createKind,wishlist.id,createDraft,urlInput,createKind==='PHOTO'?photo.mediaId:null);
            if(!current())return;readSequence.current++;
            const intent={id:wishlist.id,kind:createKind==='PHOTO'?'PHOTO_CREATE' as const:'LINK_CREATE' as const,clientRequestId:prepared.clientRequestId,requestHash:prepared.requestHash,...(createKind==='PHOTO'?{mediaId:photo.mediaId!}:{})};
            await operation.run(intent,'/wishlists/'+wishlist.id+'/items/'+(createKind==='PHOTO'?'from-media':'url'),prepared.payload,ack=>{
                const created=legacyCreateAck(ack,intent,prepared.data);
                setWishlist(old=>old?{...old,items:[...old.items.filter(row=>row.id!==created.id),created]}:old);
                setIsUrlModalOpen(false);setUrlInput('');setCreateDraft(emptyDraft);setFeedbackMessage(createText('created'));
                if(createKind==='PHOTO')void photo.check('read');
            },'POST');
        }catch{if(current())setCreateIssue(createText('invalid'));}
        finally{preparing.current=false;if(current())setIsSubmittingUrl(false);}
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
        if (!canMutate() || !deleteTarget || !wishlist || user?.id!==wishlist.userId) return;
        setIsDeleting(true);readSequence.current++;
        const target=deleteTarget,deletedId=target.type==='wishlist'?wishlist.id:target.id!;
        try {
            await operation.run({id:wishlist.id,kind:target.type==='wishlist'?'DELETE_LIST':'DELETE_ITEM',...(target.type==='item'?{itemId:deletedId}:{})},target.type==='wishlist'?'/wishlists/'+wishlist.id:'/items/'+deletedId,undefined,ack=>{
                detailDeletedAck(ack,deletedId);setDeleteModalOpen(false);setIsDetailOpen(false);setSelectedItem(null);
                if(target.type==='wishlist'){setDeleted(true);setWishlist(null);setReadError('');}
                else setWishlist(old=>old?{...old,items:old.items.filter(row=>row.id!==deletedId)}:old);
            },'DELETE');
        }finally{if(active.current){setIsDeleting(false);setDeleteModalOpen(false);}}
    };

    async function handleItemSave(item:Item,body:ReturnType<typeof detailItemBody>) {
        if(!canMutate() || !wishlist || user?.id!==wishlist.userId)return false;readSequence.current++;
        return operation.run({id:wishlist.id,kind:'ITEM_EDIT',itemId:item.id},'/items/'+item.id,body,ack=>{
            const updated=detailItemEditAck(ack,item,wishlist.id,body);
            setWishlist(old=>old?{...old,items:old.items.map(row=>row.id===item.id?updated:row)}:old);setFeedbackMessage(detailItemText('saved'));
        });
    }

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
    const [myWishlists, setMyWishlists] = useState<ReturnType<typeof detailCloneTargets>>([]);
    const [targetsLoading,setTargetsLoading]=useState(false),[targetsError,setTargetsError]=useState('');
    const targetsSequence=useRef(0);
    const [selectedTargetWishlistId, setSelectedTargetWishlistId] = useState<number | null>(null);

    const fetchMyWishlists = async () => {
        if(!token || !user || operation.busy || operation.pending)return;
        const sequence=++targetsSequence.current,version=lifetime.current,current=()=>active.current && version===lifetime.current && sequence===targetsSequence.current;
        setTargetsLoading(true);setTargetsError('');setMyWishlists([]);setSelectedTargetWishlistId(null);
        try {
            const res=await fetch(API_URL+'/wishlists',{headers:{Authorization:'Bearer '+token},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
            if(!current())return;if(!res.ok)throw new Error('Unconfirmed targets');const data=detailCloneTargets(await res.json(),user.id);if(!current())return;setMyWishlists(data);
        }catch{if(current())setTargetsError(detailItemText('targetsUnknown'));}
        finally{if(current())setTargetsLoading(false);}
    };

    const handleCloneClick = (item: Item) => {
        if(!token){navigate('/login?redirect='+encodeURIComponent('/wishlists/'+id));return;}
        if(!canMutate())return;operation.resetFeedback();setFeedbackMessage(null);setIsDetailOpen(false);setSelectedItem(null);setItemToClone(item);setIsCloneModalOpen(true);void fetchMyWishlists();
    };

    const handleCloneConfirm = async () => {
        if(!canMutate() || !wishlist || !itemToClone || !selectedTargetWishlistId || targetsLoading || targetsError)return;
        const target=myWishlists.find(row=>row.id===selectedTargetWishlistId);if(!target || target.count>=target.maxItems)return;
        const intent={id:wishlist.id,kind:'CLONE' as const,itemId:itemToClone.id,targetWishlistId:target.id,clientRequestId:crypto.randomUUID()};
        await operation.run(intent,'/items/'+intent.itemId+'/clone',{targetWishlistId:target.id,clientRequestId:intent.clientRequestId},ack=>{
            detailCloneAck(ack,intent);setIsCloneModalOpen(false);setItemToClone(null);setFeedbackMessage(detailItemText('created'));
        },'POST');
    };

    const openDetail = (item: Item) => {
        if(operation.busy || operation.pending || photo.busy || isUrlModalOpen)return;
        operation.resetFeedback();setFeedbackMessage(null);
        setSelectedItem(item);
        setIsDetailOpen(true);
    };

    const recovery=<section className="space-y-3" aria-label={legacyListText('recoveryTitle')}>
        {readError && <p role="alert">{readError}</p>}
        {operation.issue && <p role="alert">{operation.issue}</p>}
        {operation.notice && <p role="status">{operation.notice}</p>}
        {readError && <Button className="min-h-11" onClick={()=>void fetchWishlist()} disabled={operation.busy}>{detailText('retry')}</Button>}
        {operation.pending && operation.pending.id!==Number(id) ? <Link className="inline-flex min-h-11 items-center underline" to={'/wishlists/'+operation.pending.id}>{detailText('original')}</Link> : operation.pending && <>
            {operation.pending.kind==='CLONE'?<>
                <Button className="min-h-11" onClick={()=>void operation.checkClone('read')} disabled={operation.busy || operation.known}>{detailItemText('read')}</Button>
                <Button className="min-h-11" onClick={()=>void operation.checkClone('stop')} disabled={operation.busy || operation.known}>{detailItemText('stop')}</Button>
                {operation.known && <Link className="inline-flex min-h-11 items-center underline" to={'/wishlists/'+operation.pending.targetWishlistId}>{detailItemText('target')}</Link>}
            </>:['LINK_CREATE','PHOTO_CREATE'].includes(operation.pending.kind)?<>
                <Button className="min-h-11" onClick={()=>void operation.checkCreate('read')} disabled={operation.busy || operation.known}>{createText('read')}</Button>
                <Button className="min-h-11" onClick={()=>void operation.checkCreate('stop')} disabled={operation.busy || operation.known}>{createText('stop')}</Button>
                {operation.known && <Button className="min-h-11" disabled={operation.busy} onClick={()=>void fetchWishlist()}>{detailText('retry')}</Button>}
            </>:<Button className="min-h-11" onClick={()=>void operation.check(()=>fetchWishlist(false,operation.pending?.kind==='DELETE_LIST'))} disabled={operation.busy || operation.known}>{legacyListText('read')}</Button>}
            <Button className="min-h-11" onClick={()=>void operation.acknowledge()} disabled={operation.busy || !operation.checked && !operation.known}>{legacyListText(operation.known?'clean':'resume')}</Button>
        </>}
        {token && <LegacyWishPhotoRecovery photo={photo} listId={Number(id)} locked={operation.busy || !!operation.pending || isSubmittingUrl} />}
        {!operation.ready && token && <Button className="min-h-11" onClick={()=>void operation.restore()} disabled={operation.busy}>{t('common.retry')}</Button>}
    </section>;
    if (loading && !wishlist) return <div className="p-4 text-center">{t('common.processing')}</div>;
    if (!wishlist) return <div className="p-4 space-y-4">{deleted && <p role="status">{detailItemText('listDeleted')}</p>}{recovery}<Link className="inline-flex min-h-11 items-center underline" to="/dashboard">{detailItemText('dashboard')}</Link>{!token && <Link className="inline-flex min-h-11 items-center underline" to={'/login?redirect='+encodeURIComponent('/wishlists/'+id)}>{t('auth.login')}</Link>}</div>;

    const isOwner = user?.id === wishlist.userId;

    return (
        <div className="container mx-auto p-4 space-y-6 pb-24 relative min-h-screen [&_button]:min-h-11 [&_input:not([type=checkbox])]:min-h-11">
            {recovery}
            {shareUrl && <section className="space-y-3 rounded-xl border bg-white p-4" aria-label={pageText('shareUrl')}>
                <p role="alert">{pageText('shareFailed')}</p>
                <label className="block space-y-1"><span>{pageText('shareUrl')}</span><Input className="min-h-11 text-base md:text-sm" readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} /></label>
                <p className="text-sm text-muji-secondary">{pageText('shareHelp')}</p>
                <Button variant="outline" className="min-h-11" onClick={() => setShareUrl('')}>{pageText('hideShareUrl')}</Button>
            </section>}
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
                <div className="space-y-2 flex-1">
                    {isEditing ? (
                        <div className="space-y-2 max-w-lg">
                            <label className="block text-sm font-medium text-gray-700">{pageText('title')}
                                <Input className="min-h-11 text-base md:text-sm" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder={pageText('titlePlaceholder')} />
                            </label>
                            <label className="block text-sm font-medium text-gray-700">{pageText('description')}
                                <Input className="min-h-11 text-base md:text-sm" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder={pageText('descriptionPlaceholder')} />
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
                                    <Button onClick={() => void handleShare()} disabled={shareBusy} variant="outline" size="sm" className={`min-h-11 gap-2 ${copied ? 'bg-green-50 text-green-600 border-green-200 font-medium' : ''}`}>
                                        {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                                        {copied ? t('detail.linkCopied') : t('wishlist.share')}
                                    </Button>
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
                        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={detailText('edit')} disabled={!canMutate()} onClick={() => {setEditTitle(wishlist.title);setEditDesc(wishlist.description);setEditIsPublic(wishlist.isPublic);setFeedbackMessage(null);operation.resetFeedback();setIsEditModalOpen(true);}}>
                            <Edit2 className="w-5 h-5 text-gray-600" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-11 w-11" disabled={shareBusy} aria-label={t('wishlist.share')} onClick={() => void handleShare()}>
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
                                    ) : <span className="text-xs text-gray-400">{pageText('noImage')}</span>}
                                    {isProcessing && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                            <span className="text-xs text-white font-bold animate-pulse">
                                                {item.uploadStatus === 'PENDING' || item.uploadStatus === 'UPLOADING'
                                                    ? pageText('uploading')
                                                    : item.aiStatus === 'PREPARING' ? pageText('preparing') : item.aiStatus === 'PENDING' ? pageText('queued') : t('ai.analyzing')}
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
                                            <span className="text-red-600">{pageText('uploadFailed')}</span>
                                        ) : item.uploadStatus === 'PENDING' || item.uploadStatus === 'UPLOADING' ? (
                                            <span className="text-blue-600 animate-pulse">{pageText('uploading')}</span>
                                        ) : item.aiStatus === 'COMPLETED' ? (
                                            <span className="text-green-600">{t('ai.complete')}</span>
                                        ) : item.aiStatus === 'FAILED' ? (
                                            <span className="text-red-600">{t('ai.failed')}</span>
                                        ) : item.aiStatus === 'SKIPPED' ? (
                                            <span className="text-orange-600">{detailItemText('aiSkipped')}</span>
                                        ) : item.aiStatus === 'PREPARING' ? (
                                            <span className="text-blue-600 animate-pulse">{pageText('preparing')}</span>
                                        ) : item.aiStatus === 'PENDING' ? (
                                            <span className="text-yellow-600 animate-pulse">{pageText('queued')}</span>
                                        ) : item.aiStatus === 'PROCESSING' ? (
                                            <span className="text-yellow-600 animate-pulse">{pageText('recognizing')}</span>
                                        ) : (
                                            <span className="text-yellow-600">{t('ai.analyzing')}...</span>
                                        )}
                                    </div>}
                                </div>

                                {/* Actions Column - More compact */}
                                <div className="col-span-2 flex gap-1 items-center justify-end border-t pt-2">
                                    {isOwner ? (
                                        <>
                                            <Button variant="ghost" size="icon" aria-label={detailText('info')+' '+item.name} disabled={operation.busy || !!operation.pending || photo.busy || isUrlModalOpen} className="h-11 w-11 text-blue-600 hover:bg-blue-50" onClick={() => openDetail(item)}>
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
                                            <Button variant="ghost" size="icon" aria-label={detailText('info')+' '+item.name} disabled={operation.busy || !!operation.pending || photo.busy || isUrlModalOpen} className="h-11 w-11 text-blue-600 hover:bg-blue-50" onClick={() => openDetail(item)} title={detailText('info')}>
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
                                        disabled={!canMutate()}
                                        onClick={() => openCreate('LINK')}
                                    >
                                        <LinkIcon className="w-5 h-5" />
                                    </Button>
                                </div>
                                <div className="flex items-center gap-2 justify-end">
                                    <span className="bg-white px-3 py-1.5 rounded-full shadow-md text-sm font-medium text-gray-700">{t('detail.uploadImg')}</span>
                                    <Button
                                        aria-label={t('detail.uploadImg')}
                                        className="rounded-full w-12 h-12 shadow-lg bg-green-600 hover:bg-green-700 text-white p-0"
                                        disabled={!canMutate()}
                                        onClick={() => openCreate('PHOTO')}
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

                    </div>
                )
            }

            {photo.usable() && !isUrlModalOpen && isOwner && <Button className="min-h-11" disabled={!operation.allowed() || !!readError} onClick={()=>openCreate('PHOTO')}>{createText('photoTitle')}</Button>}
            {isUrlModalOpen && <MarketplaceDialog title={createText(createKind==='PHOTO'?'photoTitle':'title')} onClose={()=>setIsUrlModalOpen(false)} closeDisabled={isSubmittingUrl || operation.busy || photo.busy} closeLabel={t('common.close')}>
                <form onSubmit={handleUrlSubmit} className="space-y-4">
                    {createKind==='LINK'?<div className="space-y-1"><label htmlFor="legacy-create-source">{createText('input')}</label><Input className="min-h-11 text-base md:text-sm" id="legacy-create-source" aria-describedby="legacy-create-tip" type="text" maxLength={2000} value={urlInput} onChange={e=>setUrlInput(e.target.value)} required disabled={!canCreate()}/><p id="legacy-create-tip" className="text-sm text-muji-secondary">{createText('tip')}</p></div>:<>
                        <p className="text-sm text-muji-secondary">{createText('photoHelp')}</p>
                        {photo.mediaId && token && <PrivatePhoto id={photo.mediaId} token={token} label={createText('photoNew')} />}
                        <div className="flex flex-wrap gap-3"><Button className="min-h-11" type="button" disabled={!operation.allowed() || photo.busy || photo.removing || !!photo.result} onClick={()=>fileInputRef.current?.click()}>{createText(photo.raw?'photoRetry':'photoNew')}</Button><Button className="min-h-11" type="button" disabled={!operation.allowed() || photo.busy || photo.removing || !!photo.result} onClick={()=>cameraInputRef.current?.click()}>{createText('photoCamera')}</Button></div>
                        <input type="file" ref={fileInputRef} hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={handleFileUpload}/>
                        <input type="file" ref={cameraInputRef} hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={handleFileUpload}/>
                    </>}
                    <label className="block space-y-1"><span>{createText('name')}</span><Input className="min-h-11 text-base md:text-sm" value={createDraft.name} maxLength={200} onChange={e=>setCreateDraft(old=>({...old,name:e.target.value}))} disabled={isSubmittingUrl || operation.busy || !!operation.pending || photo.busy}/></label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{(['price','currency','budget','budgetCurrency'] as const).map(field=><label key={field} className="block space-y-1"><span>{detailItemText(field)}</span><Input className="min-h-11 text-base md:text-sm" value={createDraft[field]} inputMode={field==='price' || field==='budget'?'decimal':'text'} maxLength={field==='currency' || field==='budgetCurrency'?3:64} onChange={e=>setCreateDraft(old=>({...old,[field]:e.target.value}))} disabled={isSubmittingUrl || operation.busy || !!operation.pending || photo.busy}/></label>)}</div>
                    <label className="block space-y-1"><span>{detailItemText('notes')}</span><textarea className="min-h-24 w-full rounded-xl border p-3" value={createDraft.notes} maxLength={1000} onChange={e=>setCreateDraft(old=>({...old,notes:e.target.value}))} disabled={isSubmittingUrl || operation.busy || !!operation.pending || photo.busy}/></label>
                    {createIssue && <p role="alert">{createIssue}</p>}{operation.issue && <p role="alert">{operation.issue}</p>}{photo.issue && <p role="alert">{photo.issue}</p>}{photo.notice && createKind==='PHOTO' && <p role="status">{photo.notice}</p>}
                    <div className="flex flex-wrap justify-end gap-3"><Button className="min-h-11" variant="secondary" type="button" disabled={isSubmittingUrl || operation.busy || photo.busy} onClick={()=>setIsUrlModalOpen(false)}>{t('common.cancel')}</Button><Button className="min-h-11" type="submit" disabled={!canCreate() || isSubmittingUrl}>{createText('submit')}</Button></div>
                </form>
            </MarketplaceDialog>}

            {/* Detail Modal — all writes use the parent operation gate */}
            {selectedItem && isDetailOpen && <ItemDetailModal
                key={selectedItem.id} isOpen={isDetailOpen} onClose={()=>{setIsDetailOpen(false);setSelectedItem(null);}}
                item={wishlist.items.find(item=>item.id===selectedItem.id) ?? selectedItem}
                wisherName={selectedItem.originalUser?.name || wishlist.user?.name || pageText('anonymous')}
                wisherId={selectedItem.originalUser?.id || wishlist.userId} isOwner={isOwner}
                busy={operation.busy} locked={!!token && !canMutate()} issue={operation.issue} notice={operation.notice}
                onSave={body=>handleItemSave(wishlist.items.find(item=>item.id===selectedItem.id) ?? selectedItem,body)}
                onDelete={()=>{setIsDetailOpen(false);handleDeleteItem(selectedItem.id);}}
                onClone={()=>handleCloneClick(selectedItem)}
            />}

            {isCloneModalOpen && <MarketplaceDialog title={detailText('clone')+' · '+(itemToClone?.name??'')} onClose={()=>setIsCloneModalOpen(false)} closeDisabled={operation.busy} closeLabel={t('common.close')}>
                <div className="space-y-4">
                    {targetsLoading && <p role="status">{t('common.loading')}</p>}
                    {targetsError && <p role="alert">{targetsError}</p>}
                    {!targetsLoading && !targetsError && !myWishlists.length && <p>{detailItemText('emptyTargets')}</p>}
                    {myWishlists.map(row=><label key={row.id} className="flex min-h-11 items-center gap-3 rounded-xl border p-3"><input type="radio" name="clone-target" value={row.id} checked={selectedTargetWishlistId===row.id} onChange={()=>setSelectedTargetWishlistId(row.id)} disabled={row.count>=row.maxItems || !canMutate()}/><span>{row.title} · {row.count}/{row.maxItems}</span></label>)}
                    <Button className="min-h-11" onClick={()=>void fetchMyWishlists()} disabled={operation.busy || !!operation.pending || targetsLoading}>{detailItemText('readTargets')}</Button>
                    <Link className="inline-flex min-h-11 items-center underline" to="/dashboard">{detailItemText('createList')}</Link>
                    <Button className="min-h-11" onClick={handleCloneConfirm} disabled={!selectedTargetWishlistId || !canMutate() || !!targetsError || targetsLoading}>{detailItemText('confirmClone')}</Button>
                    {(operation.issue || operation.notice) && <p role="status">{operation.issue || operation.notice}</p>}
                </div>
            </MarketplaceDialog>}
            {/* Edit Wishlist Modal */}
            {isEditModalOpen && <MarketplaceDialog title={detailText('edit')} onClose={()=>setIsEditModalOpen(false)} closeDisabled={operation.busy} closeLabel={t('common.close')}>
                <div className="space-y-4">
                    <label className="block">{detailText('title')}<Input className="min-h-11 text-base md:text-sm" value={editTitle} maxLength={200} onChange={e=>setEditTitle(e.target.value)} disabled={operation.busy || !!operation.pending}/></label>
                    <label className="block">{detailText('description')}<Input className="min-h-11 text-base md:text-sm" value={editDesc} maxLength={1000} onChange={e=>setEditDesc(e.target.value)} disabled={operation.busy || !!operation.pending}/></label>
                    <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={editIsPublic} onChange={e=>setEditIsPublic(e.target.checked)} disabled={operation.busy || !!operation.pending}/>{detailText('public')}</label>
                    <Button className="min-h-11 w-full" onClick={handleUpdateWishlist} disabled={!canMutate()}>{t('common.save')}</Button>
                    {(operation.issue || operation.notice) && <p role="status">{operation.issue || operation.notice}</p>}
                </div>
            </MarketplaceDialog>}

            {deleteModalOpen && <MarketplaceDialog title={(deleteTarget?.type==='wishlist'?detailText('removeList'):detailText('remove'))+' · '+(deleteTarget?.type==='wishlist'?wishlist.title:wishlist.items.find(item=>item.id===deleteTarget?.id)?.name??'')} onClose={()=>setDeleteModalOpen(false)} closeDisabled={isDeleting || operation.busy} closeLabel={t('common.close')}>
                <p className="mb-4">{detailItemText('deleteConfirm')}</p>
                <div className="flex flex-wrap justify-end gap-3"><Button className="min-h-11" variant="secondary" onClick={()=>setDeleteModalOpen(false)} disabled={isDeleting || operation.busy}>{t('common.cancel')}</Button><Button className="min-h-11" variant="destructive" onClick={executeDelete} disabled={isDeleting || !canMutate()}>{deleteTarget?.type==='wishlist'?detailText('removeList'):detailText('remove')}</Button></div>
            </MarketplaceDialog>}

            {/* Guest CTA Banner */}
            {
                !token && (
                    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-40 flex items-center justify-between pb-8 md:pb-4">
                        <div className="flex-1 mr-4">
                            <p className="font-bold text-muji-primary text-sm sm:text-base">{pageText('guestTitle')}</p>
                            <p className="text-xs text-muji-secondary">{pageText('guestHelp')}</p>
                        </div>
                        <Link to="/register" className="inline-flex min-h-11 items-center rounded-md bg-muji-primary px-4 py-2 text-white shadow-lg hover:bg-stone-800">
                                <UserPlus className="w-4 h-4 mr-2" />
                                {pageText('join')}
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
