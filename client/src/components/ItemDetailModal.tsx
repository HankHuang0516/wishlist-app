import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/Dialog";
import { X, Edit2, Trash, Save, ExternalLink, Bot, Check } from "lucide-react";
import { API_URL } from '../config';
import { useAuth } from "../context/AuthContext";
import { Link } from 'react-router-dom';
import { formatPriceWithConversion } from "../utils/currency";
import { getImageUrl } from "../utils/image";

interface Item {
    id: number;
    name: string;
    price?: string;
    currency?: string;
    link?: string;
    aiLink?: string;  // AI-generated shopping link
    imageUrl?: string;
    notes?: string;
    aiStatus: string; // PENDING, COMPLETED, FAILED, SKIPPED
    aiError?: string;
    tags?: string[];
}

interface ItemDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: Item;
    onUpdate: () => void; // Refresh parent list
    wisherName?: string;
    wisherId?: number;
    isOwner?: boolean; // New prop to check ownership
}

export default function ItemDetailModal({ isOpen, onClose, item, onUpdate, wisherName, wisherId, isOwner }: ItemDetailModalProps) {
    const { token } = useAuth();
    const [isEditing, setIsEditing] = useState(false);

    // D8 Fix logic: Local display state to handle immediate updates
    // D8 Fix logic: Local display state to handle immediate updates
    const [displayItem, setDisplayItem] = useState<Item>(item);
    const lastSavedData = useRef<any>(null); // Re-trigger build

    const [formData, setFormData] = useState({
        name: "",
        price: "",
        currency: "",
        link: "",
        notes: ""
    });

    const [error, setError] = useState("");

    useEffect(() => {
        if (item) {
            // Check if incoming item is stale compared to what we just saved
            if (lastSavedData.current) {
                const saved = lastSavedData.current;
                // If the incoming data differs from saved data, it might be stale.
                // We strictly require the server data to match our saved expectation before syncing.
                const isMatch =
                    item.name === saved.name &&
                    item.price === saved.price &&
                    (item.currency || 'TWD') === (saved.currency || 'TWD') &&
                    (item.link || '') === (saved.link || '') &&
                    (item.notes || '') === (saved.notes || '');

                if (!isMatch) {
                    return; // Ignore stale update, keep local display
                }
                lastSavedData.current = null; // Synced!
            }

            setDisplayItem(item); // Update if parent passes new prop
            setFormData({
                name: item.name || "",
                price: item.price || "",
                currency: item.currency || "TWD",
                link: item.link || "",
                notes: item.notes || ""
            });
        }
    }, [item]);

    // Reset ref when modal re-opens
    useEffect(() => {
        if (!isOpen) lastSavedData.current = null;
    }, [isOpen]);

    // Use displayItem for rendering instead of item
    const currentItem = displayItem;

    if (!isOpen) return null;

    // Is current user original wisher or list owner?
    const is403 = currentItem.aiError && currentItem.aiError.includes('403');

    // Smart link display logic:
    // - Use aiLink from database (if available)
    // - Fallback to dynamic Google Shopping search if no aiLink
    const aiLink = currentItem.aiLink || `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(currentItem.name)}`;

    const handleSave = async () => {
        try {
            const res = await fetch(`${API_URL}/items/${currentItem.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                // Optimistic Update: Update local display state immediately
                // Optimistic Update: Update local display state immediately
                setDisplayItem(prev => ({
                    ...prev,
                    name: formData.name,
                    price: formData.price,
                    currency: formData.currency,
                    link: formData.link,
                    notes: formData.notes
                }));

                lastSavedData.current = formData; // Mark this as the expected truth

                onUpdate(); // Trigger background sync
                setIsEditing(false); // Return to View Mode (now showing updated data)
                setIsEditing(false); // Return to View Mode (now showing updated data)
            } else {
                setError("更新失敗");
            }
        } catch (error) {
            console.error(error);
            setError("更新發生錯誤");
        }
    };

    const handleDelete = async () => {
        if (!confirm("確定要刪除此物品嗎？")) return;
        try {
            const res = await fetch(`${API_URL}/items/${currentItem.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                onUpdate();
                onClose();
                onClose();
            } else {
                setError("刪除失敗");
            }
        } catch (e) {
            console.error(e);
            setError("刪除發生錯誤");
        }
    };

    // Cloning State
    const [isCloning, setIsCloning] = useState(false);
    const [myWishlists, setMyWishlists] = useState<any[]>([]);
    const [cloneSuccess, setCloneSuccess] = useState(false);

    const handleClone = async () => {
        setIsCloning(true);
        // Fetch user's wishlists
        try {
            const res = await fetch(`${API_URL}/wishlists`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setMyWishlists(await res.json());
            }
        } catch (e) {
            console.error(e);
            setIsCloning(false);
        }
    };

    const executeClone = async (wishlistId: number) => {
        try {
            const res = await fetch(`${API_URL}/wishlists/${wishlistId}/items`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: currentItem.name,
                    price: currentItem.price,
                    currency: currentItem.currency,
                    url: currentItem.link, // Note: API expects 'url' but model has 'link'
                    notes: currentItem.notes,
                    imageUrl: currentItem.imageUrl
                })
            });

            if (res.ok) {
                // Show inline success
                setCloneSuccess(true);
                setTimeout(() => {
                    setCloneSuccess(false);
                    setIsCloning(false);
                    onClose();
                }, 1500);
            } else {
                console.error("Clone failed");
                setError("加入清單失敗");
            }
        } catch (e) {
            console.error(e);
            setError("發生錯誤");
        }
    };

    if (isCloning) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <Card className="w-full max-w-sm bg-white">
                    <CardHeader>
                        <CardTitle>選擇要加入的清單</CardTitle>
                    </CardHeader>
                    <CardContent className="max-h-[60vh] overflow-y-auto space-y-2">
                        {myWishlists.map(list => (
                            <Button
                                key={list.id}
                                variant="outline"
                                className="w-full justify-start"
                                onClick={() => executeClone(list.id)}
                            >
                                {list.title}
                            </Button>
                        ))}
                        {myWishlists.length === 0 && <p className="text-center text-gray-500">您還沒有建立願望清單</p>}
                    </CardContent>
                    <CardFooter>
                        <Button variant="ghost" onClick={() => setIsCloning(false)} className="w-full">
                            取消
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-lg bg-white max-h-[90vh] overflow-y-auto">
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        {isEditing ? (
                            <Input
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="font-bold text-lg"
                                placeholder="物品名稱"
                            />
                        ) : (
                            <span className="break-words pr-2 line-clamp-2 leading-tight">{currentItem.name}</span>
                        )}
                        <div className={`text-xs px-2 py-1 rounded shrink-0 ${currentItem.aiStatus === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                            currentItem.aiStatus === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                                currentItem.aiStatus === 'SKIPPED' ? 'bg-orange-100 text-orange-700' :
                                    'bg-red-100 text-red-700'
                            }`}>
                            {currentItem.aiStatus === 'PENDING' ? 'AI 識別中...' :
                                currentItem.aiStatus === 'COMPLETED' ? 'AI 識別完成' :
                                    currentItem.aiStatus === 'SKIPPED' ? '傳統模式' : '識別失敗'}
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Error Feedback */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm mb-4">
                            {error}
                        </div>
                    )}

                    {/* 403 / AI Error Alert */}
                    {is403 && (
                        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
                            <strong>AI 無法存取此網頁 (反爬蟲阻擋)</strong>
                            <p className="mt-1">建議您截圖商品圖片，並使用「上傳圖片」功能新增物品。</p>
                        </div>
                    )}

                    {/* Image */}
                    <div className="flex justify-center bg-gray-50 rounded-lg p-2">
                        {currentItem.imageUrl ? (
                            <img
                                src={getImageUrl(currentItem.imageUrl)}
                                alt={currentItem.name}
                                className="max-h-64 object-contain"
                            />
                        ) : (
                            <div className="h-48 flex items-center justify-center text-gray-400">No Image</div>
                        )}
                    </div>

                    {/* Info */}
                    <div className="space-y-3">
                        {/* Wisher Info */}
                        {wisherName && !isEditing && (
                            <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg">
                                <span className="text-sm font-medium text-gray-600">
                                    最初許願者:
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-gray-900">{wisherName}</span>
                                    {wisherId && (
                                        <Link to={`/users/${wisherId}/profile`}>
                                            <Info className="w-5 h-5 text-blue-600 hover:text-blue-800 cursor-pointer" />
                                        </Link>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-500">價格</label>
                                {isEditing ? (
                                    <div className="flex gap-2">
                                        <Input
                                            value={formData.currency}
                                            onChange={e => setFormData({ ...formData, currency: e.target.value })}
                                            placeholder="幣別 (TWD)"
                                            className="w-20"
                                        />
                                        <Input
                                            value={formData.price}
                                            onChange={e => setFormData({ ...formData, price: e.target.value })}
                                            placeholder="價格"
                                            className="flex-1"
                                        />
                                    </div>
                                ) : (
                                    <p className="font-medium text-lg">
                                        {currentItem.price ? formatPriceWithConversion(currentItem.price, currentItem.currency || 'TWD') : 'Unknown'}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-500">連結</label>
                                {isEditing ? (
                                    <Input
                                        value={formData.link}
                                        onChange={e => setFormData({ ...formData, link: e.target.value })}
                                        placeholder="商品連結"
                                    />
                                ) : (
                                    <div className="flex flex-col gap-2 mt-1">
                                        {/* User-provided link (if any) */}
                                        {currentItem.link && (
                                            <a href={currentItem.link} target="_blank" rel="noopener noreferrer" className="flex items-center text-blue-600 hover:underline text-sm">
                                                <ExternalLink className="w-4 h-4 mr-1" />
                                                商品連結
                                            </a>
                                        )}
                                        {/* AI Link: Show if user link exists (both shown) or no user link (AI only) */}
                                        <a href={aiLink} target="_blank" rel="noopener noreferrer" className="flex items-center text-green-600 hover:underline text-sm">
                                            <ExternalLink className="w-4 h-4 mr-1" />
                                            {currentItem.link ? 'AI 購買連結' : '購買連結'}
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-500">描述 / 備註</label>
                            {isEditing ? (
                                <textarea
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full min-h-[100px] border rounded-md p-2 text-sm focus:ring-muji-primary focus:border-muji-primary"
                                    placeholder="輸入描述..."
                                />
                            ) : (
                                <p className="text-gray-700 mt-1 whitespace-pre-wrap">{currentItem.notes || "無描述"}</p>
                            )}
                        </div>
                    </div>

                </CardContent>
                <CardFooter className="flex justify-between border-t pt-4">
                    {isEditing ? (
                        <div className="flex w-full justify-between">
                            <Button variant="secondary" onClick={() => setIsEditing(false)}>
                                <X className="w-4 h-4 mr-2" /> Cancel
                            </Button>
                            <Button onClick={handleSave}>
                                <Save className="w-4 h-4 mr-2" /> Save
                            </Button>
                        </div>
                    ) : (
                        <>
                            <Button variant="ghost" onClick={onClose}>Close</Button>
                            <div className="flex gap-2">
                                {isOwner ? (
                                    <>
                                        <Button variant="outline" onClick={() => setIsEditing(true)}>
                                            <Edit2 className="w-4 h-4 mr-2" />
                                            編輯
                                        </Button>
                                        <Button variant="destructive" onClick={handleDelete} size="icon">
                                            <Trash className="w-4 h-4" />
                                        </Button>
                                    </>
                                ) : (
                                    <Button onClick={handleClone} className="bg-muji-primary text-white">
                                        <ExternalLink className="w-4 h-4 mr-2" />
                                        加入我的清單
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}
