// useState removed
import { Button } from "./ui/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/Card";
import { ExternalLink, Info, Trash } from "lucide-react";
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

    if (!isOpen) return null;

    // Is current user original wisher or list owner?
    const is403 = item.aiError && item.aiError.includes('403');
    const aiSearchLink = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(item.name)}`;
    const showAiLink = item.link !== aiSearchLink; // Only show if not identical

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
                        <span className="truncate pr-2">{item.name}</span>
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

                    {/* AI Info */}
                    <div className="space-y-3">
                        {/* Wisher Info */}
                        {wisherName && (
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

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-500">價格</label>
                                <p className="font-medium text-lg">
                                    {item.price ? `${item.currency || 'TWD'} ${item.price}` : 'Unknown'}
                                </p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-500">操作</label>
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
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-500">描述</label>
                            <p className="text-gray-700 mt-1">{item.notes || "無描述"}</p>
                        </div>
                    </div>

                </CardContent>
                <CardFooter className="flex justify-between border-t pt-4">
                    <Button variant="ghost" onClick={onClose}>返回</Button>
                    {isOwner && (
                        <Button variant="destructive" onClick={handleDelete} className="flex items-center">
                            <Trash className="w-4 h-4 mr-2" />
                            刪除物品
                        </Button>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}
