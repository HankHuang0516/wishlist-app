import { useState, useEffect } from "react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/Card";
import { ExternalLink, Info, Trash, Edit2, Save, X } from "lucide-react";
import { API_URL, API_BASE_URL } from '../config';
import { useAuth } from "../context/AuthContext";
import { Link } from 'react-router-dom';

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
    const [formData, setFormData] = useState({
        name: "",
        price: "",
        currency: "",
        link: "",
        notes: ""
    });

    useEffect(() => {
        if (item) {
            setFormData({
                name: item.name || "",
                price: item.price || "",
                currency: item.currency || "TWD",
                link: item.link || "",
                notes: item.notes || ""
            });
        }
    }, [item]);

    if (!isOpen) return null;

    // Is current user original wisher or list owner?
    const is403 = item.aiError && item.aiError.includes('403');
    const aiSearchLink = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(item.name)}`;
    const showAiLink = item.link !== aiSearchLink; // Only show if not identical

    const handleSave = async () => {
        try {
            const res = await fetch(`${API_URL}/items/${item.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                onUpdate();
                setIsEditing(false);
            } else {
                alert("更新失敗");
            }
        } catch (error) {
            console.error(error);
            alert("更新發生錯誤");
        }
    };

    const handleDelete = async () => {
        if (!confirm("確定要刪除此物品嗎？")) return;
        try {
            const res = await fetch(`${API_URL}/items/${item.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                onUpdate();
                onClose();
            } else {
                alert("刪除失敗");
            }
        } catch (e) {
            console.error(e);
            alert("刪除發生錯誤");
        }
    };

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
                            <span className="truncate pr-2">{item.name}</span>
                        )}
                        <div className={`text-xs px-2 py-1 rounded shrink-0 ${item.aiStatus === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                            item.aiStatus === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                            }`}>
                            {item.aiStatus === 'PENDING' ? 'AI 識別中...' :
                                item.aiStatus === 'COMPLETED' ? 'AI 識別完成' : '識別失敗'}
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Error Alert */}
                    {is403 && (
                        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
                            <strong>AI 無法存取此網頁 (反爬蟲阻擋)</strong>
                            <p className="mt-1">建議您截圖商品圖片，並使用「上傳圖片」功能新增物品。</p>
                        </div>
                    )}

                    {/* Image */}
                    <div className="flex justify-center bg-gray-50 rounded-lg p-2">
                        {item.imageUrl ? (
                            <img
                                src={`${API_BASE_URL}${item.imageUrl}`}
                                alt={item.name}
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
                                        {item.price ? `${item.currency || 'TWD'} ${item.price}` : 'Unknown'}
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
                                        {item.link && (
                                            <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center text-blue-600 hover:underline text-sm">
                                                <ExternalLink className="w-4 h-4 mr-1" />
                                                商品連結
                                            </a>
                                        )}
                                        {/* AI Search Link */}
                                        {showAiLink && (
                                            <a href={aiSearchLink} target="_blank" rel="noopener noreferrer" className="flex items-center text-green-600 hover:underline text-sm">
                                                <ExternalLink className="w-4 h-4 mr-1" />
                                                AI 購買連結
                                            </a>
                                        )}
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
                                <p className="text-gray-700 mt-1 whitespace-pre-wrap">{item.notes || "無描述"}</p>
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
                                {isOwner && (
                                    <>
                                        <Button variant="outline" onClick={() => setIsEditing(true)}>
                                            <Edit2 className="w-4 h-4 mr-2" />
                                            編輯
                                        </Button>
                                        <Button variant="destructive" onClick={handleDelete} size="icon">
                                            <Trash className="w-4 h-4" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}
