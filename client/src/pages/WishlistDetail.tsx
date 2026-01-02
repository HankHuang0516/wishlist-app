import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "../components/ui/Card";
import { Trash2, Edit2, Plus, Info, EyeOff, Eye, Link as LinkIcon, Image as ImageIcon } from "lucide-react";
import ItemDetailModal from "../components/ItemDetailModal";
import { API_URL, API_BASE_URL } from '../config';
import DeleteConfirmModal from "../components/DeleteConfirmModal";

interface Item {
    id: number;
    name: string;
    price?: string;
    currency?: string;
    link?: string;
    imageUrl?: string;
    notes?: string;
    aiStatus: string; // PENDING, COMPLETED, FAILED
    aiError?: string;
    isHidden: boolean;
    originalUser?: {
        id: number;
        name: string;
        nicknames: string | null;
    };
}

interface Wishlist {
    id: number;
    title: string;
    description: string;
    isPublic: boolean;
    items: Item[];
    userId: number;
    user?: {
        id: number;
        name: string;
        nicknames?: string;
    };
    maxItems?: number;
}

export default function WishlistDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token, user } = useAuth();
    const [wishlist, setWishlist] = useState<Wishlist | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState("");
    const [editDesc, setEditDesc] = useState("");
    const [editIsPublic, setEditIsPublic] = useState(false);

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ type: 'item' | 'wishlist', id?: number } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // FAB & Modal State
    const [isFabOpen, setIsFabOpen] = useState(false);
    const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
    const [urlInput, setUrlInput] = useState("");

    // Item Detail Modal State
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchWishlist();
    }, [id]);

    // Separate useEffect for polling AI status
    useEffect(() => {
        const hasPending = wishlist?.items.some(i => i.aiStatus === 'PENDING');
        if (!hasPending) return;

        // Polling for AI status - only when there are pending items
        const interval = setInterval(() => {
            fetchWishlist(true); // silent fetch
        }, 5000); // 5 seconds (increased from 3 to reduce rate limit pressure)

        return () => clearInterval(interval);
    }, [wishlist?.items.length, id]); // Only re-run when items count changes, not on every items update

    const fetchWishlist = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const res = await fetch(`${API_URL}/wishlists/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setWishlist(data);
                if (!silent) {
                    setEditTitle(data.title);
                    setEditDesc(data.description || "");
                    setEditIsPublic(data.isPublic);
                }
            } else {
                if (!silent) navigate('/dashboard');
            }
        } catch (error) {
            console.error(error);
        } finally {
            if (!silent) setLoading(false);
        }
    };



    const handleUpdateWishlist = async () => {
        try {
            const res = await fetch(`${API_URL}/wishlists/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    title: editTitle,
                    description: editDesc,
                    isPublic: editIsPublic
                })
            });
            if (res.ok) {
                fetchWishlist();
                setIsEditing(false);
            }
        } catch (error) { console.error(error); }
    };

    // Item Actions
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
                if (res.ok) fetchWishlist();
            } catch (err) { console.error(err); }
        }
    };



    const handleUrlSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/wishlists/${id}/items/url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ url: urlInput })
            });
            if (res.ok) {
                fetchWishlist();
                setIsUrlModalOpen(false);
                setUrlInput("");
            } else {
                alert("Failed to fetch URL. Please check the link.");
            }
        } catch (err) { console.error(err); }
    };

    const handleDeleteWishlist = () => {
        setDeleteTarget({ type: 'wishlist' });
        setDeleteModalOpen(true);
    };

    const handleDeleteItem = (itemId: number) => {
        setDeleteTarget({ type: 'item', id: itemId });
        setDeleteModalOpen(true);
    };

    const executeDelete = async () => {
        if (!deleteTarget) return;
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
                    alert("Delete failed");
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
                    alert(`Delete failed: ${data.error || res.statusText}`);
                }
            }
        } catch (error: any) {
            alert("Error executing delete: " + error.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleToggleHide = async (item: Item) => {
        try {
            const res = await fetch(`${API_URL}/items/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ isHidden: !item.isHidden })
            });
            if (res.ok) fetchWishlist(true);
        } catch (err) { console.error(err); }
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
        setItemToClone(item);
        fetchMyWishlists(); // Load fresh list
        setIsCloneModalOpen(true);
    };

    const handleCloneConfirm = async () => {
        if (!itemToClone || !selectedTargetWishlistId) return;

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
                alert("已成功加入您的願望清單！");
                setIsCloneModalOpen(false);
                setItemToClone(null);
            } else {
                const data = await res.json();
                alert(data.error || "複製失敗");
            }
        } catch (err) { console.error(err); }
    };

    const openDetail = (item: Item) => {
        setSelectedItem(item);
        setIsDetailOpen(true);
    };

    if (loading && !wishlist) return <div className="p-4 text-center">Loading...</div>;
    if (!wishlist) return <div className="p-4 text-center">Wishlist not found</div>;

    const isOwner = user?.id === wishlist.userId;

    return (
        <div className="container mx-auto p-4 space-y-6 pb-24 relative min-h-screen">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div className="space-y-2 flex-1">
                    {isEditing ? (
                        <div className="space-y-2 max-w-lg">
                            <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Title" />
                            <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description" />

                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="isPublic"
                                    checked={editIsPublic}
                                    onChange={(e) => setEditIsPublic(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-muji-primary focus:ring-muji-primary"
                                />
                                <label htmlFor="isPublic" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    公開此清單 (Public)
                                </label>
                            </div>

                            <div className="flex gap-2">
                                <Button onClick={handleUpdateWishlist} size="sm">Save</Button>
                                <Button variant="secondary" onClick={() => setIsEditing(false)} size="sm">Cancel</Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                <h1 className="text-3xl font-bold text-muji-primary">{wishlist.title}</h1>
                                <span className="text-sm bg-gray-100 px-2 py-1 rounded text-gray-600">
                                    {wishlist.items.length}/{wishlist.maxItems || 100}
                                </span>
                            </div>
                            <p className="text-muji-secondary">{wishlist.description}</p>
                        </>
                    )}
                </div>

                {isOwner && !isEditing && (
                    <div className="flex gap-2">
                        <Button variant="secondary" size="icon" onClick={() => setIsEditing(true)}>
                            <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="destructive" size="icon" onClick={handleDeleteWishlist}>
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                )}
            </div>

            {/* Item List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {wishlist.items.map(item => (
                    <Card key={item.id} className={`overflow-hidden transition-opacity ${item.isHidden ? 'opacity-50' : 'opacity-100'} border-l-4 ${item.aiStatus === 'COMPLETED' ? 'border-l-green-500' :
                        item.aiStatus === 'PENDING' ? 'border-l-yellow-500' : 'border-l-red-500'
                        }`}>
                        <CardContent className="p-4 flex gap-4 h-full">
                            {/* Image & Main Info */}
                            <div className="w-24 h-24 bg-gray-100 rounded flex-shrink-0 flex items-center justify-center relative overflow-hidden">
                                {item.imageUrl ? (
                                    <img src={`${API_BASE_URL}${item.imageUrl}`} alt={item.name} className="w-full h-full object-cover" />
                                ) : <span className="text-xs text-gray-400">No Img</span>}
                                {item.aiStatus === 'PENDING' && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                        <span className="text-xs text-white font-bold animate-pulse">AI識別中</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 flex flex-col justify-between">
                                <div>
                                    <h3 className="font-semibold text-lg line-clamp-1">{item.name}</h3>
                                    <p className="text-red-500 font-medium">{item.price ? `${item.price} ${item.currency || 'NTD'}` : '---'}</p>
                                </div>
                                <div className="text-xs text-gray-500">
                                    {item.aiStatus === 'COMPLETED' ? (
                                        <span className="text-green-600">AI 識別完成</span>
                                    ) : item.aiStatus === 'FAILED' ? (
                                        <span className="text-red-600">識別失敗</span>
                                    ) : (
                                        <span className="text-yellow-600">AI 識別中...</span>
                                    )}
                                </div>
                            </div>

                            {/* Actions Column */}
                            <div className="flex flex-col gap-2 justify-center border-l pl-3 ml-1">
                                {isOwner ? (
                                    <>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => openDetail(item)}>
                                            <Info className="w-5 h-5 font-bold" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100" onClick={() => handleToggleHide(item)}>
                                            {item.isHidden ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteItem(item.id)}>
                                            <Trash2 className="w-5 h-5" />
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        {/* Visitor Actions: Clone (+), Info (i), Watch (Eye) */}
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => handleCloneClick(item)} title="Add to My Wishlist">
                                            <Plus className="w-5 h-5 font-bold" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => openDetail(item)} title="View Info">
                                            <Info className="w-5 h-5 font-bold stroke-[3px]" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* FAB & Menu */}
            {isOwner && (
                <div className="fixed bottom-8 right-8 z-20 flex flex-col items-end gap-3">
                    {/* Menu Options */}
                    {isFabOpen && (
                        <div className="flex flex-col gap-2 animate-in slide-in-from-bottom-5 fade-in duration-200">
                            <div className="flex items-center gap-2">
                                <span className="bg-white px-2 py-1 rounded shadow text-xs font-medium">文字/連結</span>
                                <Button
                                    className="rounded-full w-12 h-12 shadow-lg bg-blue-600 hover:bg-blue-700 text-white p-0"
                                    onClick={() => { setIsFabOpen(false); setIsUrlModalOpen(true); }}
                                >
                                    <LinkIcon className="w-5 h-5" />
                                </Button>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="bg-white px-2 py-1 rounded shadow text-xs font-medium">上傳照片</span>
                                <Button
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
            )}

            {/* URL Input Modal */}
            {isUrlModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <Card className="w-full max-w-md bg-white">
                        <CardHeader>
                            <CardTitle>新建許願物品</CardTitle>
                        </CardHeader>
                        <form onSubmit={handleUrlSubmit}>
                            <CardContent>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">商品連結或名稱</label>
                                    <Input
                                        placeholder="貼上網址 或 輸入商品名稱 (例如: Apple Watch)"
                                        value={urlInput}
                                        onChange={e => setUrlInput(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                    <p className="text-xs text-gray-500 mt-2">
                                        💡 <b>Smart Input:</b> 貼上網址可自動抓取圖片；直接輸入名稱，AI 將自動搜尋並填寫資料！
                                    </p>
                                </div>
                            </CardContent>
                            <CardFooter className="flex justify-end gap-2">
                                <Button variant="secondary" type="button" onClick={() => setIsUrlModalOpen(false)}>取消</Button>
                                <Button type="submit">新增</Button>
                            </CardFooter>
                        </form>
                    </Card>
                </div>
            )}

            {/* Detail Modal */}
            {selectedItem && (
                <ItemDetailModal
                    isOpen={isDetailOpen}
                    onClose={() => setIsDetailOpen(false)}
                    item={selectedItem}
                    onUpdate={() => fetchWishlist(true)}
                    wisherName={selectedItem.originalUser?.name || wishlist.user?.name || "User"}
                    wisherId={selectedItem.originalUser?.id || wishlist.userId}
                    isOwner={isOwner}
                />
            )}

            {/* Clone Selection Modal */}
            {isCloneModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <Card className="w-full max-w-sm bg-white">
                        <CardHeader>
                            <CardTitle>加入到我的願望清單</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-gray-600">請選擇要儲存此物品的清單：</p>
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
                                    <p className="text-sm text-red-500">您還沒有建立任何清單。</p>
                                )}
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setIsCloneModalOpen(false)}>取消</Button>
                            <Button onClick={handleCloneConfirm} disabled={!selectedTargetWishlistId}>確認加入</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}

            <DeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={executeDelete}
                title={deleteTarget?.type === 'wishlist' ? "刪除願望清單" : "刪除物品"}
                message={deleteTarget?.type === 'wishlist' ? "您確定要刪除整個願望清單嗎？此操作無法復原。" : "您確定要刪除此物品嗎？"}
                isDeleting={isDeleting}
            />
        </div>
    );
}
