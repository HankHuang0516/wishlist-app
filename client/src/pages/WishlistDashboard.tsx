import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
// Removed missing WishlistCard import
import { API_URL } from '../config';
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button"; // Added Button
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../components/ui/Card";
import {
    Plus, Share2, Trash2, Edit2, Eye, EyeOff, Search, Gift
} from "lucide-react"; // Added Icons


import { t } from "../utils/localization";

import DeleteConfirmModal from "../components/DeleteConfirmModal";

interface Wishlist {
    id: number;
    title: string;
    description: string;
    isPublic: boolean;
    _count?: {
        items: number;
    };
    items?: any[];
}

export default function WishlistDashboard() {
    const { token, user } = useAuth();
    const { userId } = useParams();
    const isOwner = !userId;

    const [wishlists, setWishlists] = useState<Wishlist[]>([]);
    const [targetUserName, setTargetUserName] = useState("User");
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [newIsPublic, setNewIsPublic] = useState(true);

    // Delete State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCreateExpanded, setIsCreateExpanded] = useState(false);

    const handleDeleteClick = (id: number) => {
        setDeleteId(id);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`${API_URL}/wishlists/${deleteId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setWishlists(prev => prev.filter(w => w.id !== deleteId));
                setDeleteModalOpen(false);
            } else {
                alert(t('common.error'));
            }
        } catch (error) { console.error(error); }
        finally { setIsDeleting(false); }
    };

    const handleTogglePrivacy = async (id: number, currentStatus: boolean) => {
        try {
            const res = await fetch(`${API_URL}/wishlists/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ isPublic: !currentStatus })
            });

            if (res.ok) {
                // Optimistic update
                setWishlists(prev => prev.map(w =>
                    w.id === id ? { ...w, isPublic: !currentStatus } : w
                ));
            }
        } catch (err) { console.error(err); }
    };

    const [maxCapacity, setMaxCapacity] = useState(100);

    useEffect(() => {
        fetchWishlists();
        if (!isOwner && userId) {
            fetchTargetUser();
        } else if (isOwner) {
            fetchSelf();
        }
    }, [userId]);

    const fetchSelf = async () => {
        try {
            const res = await fetch(`${API_URL}/users/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.maxWishlistItems) setMaxCapacity(data.maxWishlistItems);
            }
        } catch (e) { console.error(e); }
    };

    const fetchTargetUser = async () => {
        try {
            const res = await fetch(`${API_URL}/users/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const user = await res.json();
                setTargetUserName(user.name);
            }
        } catch (error) {
            console.error(error);
        }
    };

    const fetchWishlists = async () => {
        try {
            const url = !userId
                ? `${API_URL}/wishlists`
                : `${API_URL}/users/${userId}/wishlists`;

            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setWishlists(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            const res = await fetch(`${API_URL}/wishlists`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ title: newTitle, description: newDescription, isPublic: newIsPublic })
            });

            if (res.ok) {
                const newList = await res.json();
                setWishlists([newList, ...wishlists]);
                setNewTitle("");
                setNewDescription("");
            }
        } catch (error) {
            console.error(error);
        } finally {
            setCreating(false);
        }
    };

    if (loading) {
        return (
            <div className="container mx-auto p-4 space-y-8">
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
    const totalItems = wishlists.reduce((acc, list) => acc + (list.items?.length || 0), 0);

    return (
        <div className="container mx-auto p-4 space-y-8">
            {/* Header / Dashboard Stats */}
            {isOwner && (
                <div className="grid grid-cols-1 mb-8">
                    <Card className="bg-muji-light border-none">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">{t('dashboard.totalItems')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-muji-primary">
                                {totalItems} <span className="text-sm text-gray-400 font-normal">/ {user?.isPremium ? '∞' : maxCapacity} ({t('dashboard.perList')})</span>
                            </div>
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

                {/* Search Bar */}
                <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder={t('dashboard.searchPlaceholder') || "Search wishlists..."}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-9"
                    />
                    {searchQuery && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1 h-8 w-8 hover:bg-transparent"
                            onClick={() => setSearchQuery("")}
                        >
                            <X className="h-4 w-4 text-gray-400" />
                        </Button>
                    )}
                </div>
            </div>

            {isOwner && (
                <div className="mb-8">
                    {!isCreateExpanded ? (
                        <Button
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
                                <Button variant="ghost" size="sm" onClick={() => setIsCreateExpanded(false)}>
                                    ✕
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleCreate} className="space-y-4">
                                    <div>
                                        <Input
                                            placeholder={t('dashboard.titlePlaceholder')}
                                            value={newTitle}
                                            onChange={(e) => setNewTitle(e.target.value)}
                                            maxLength={50}
                                            required
                                            autoFocus
                                        />
                                        <div className="text-right text-xs text-gray-400 mt-1">
                                            {newTitle.length}/50
                                        </div>
                                    </div>
                                    <Input
                                        placeholder={t('dashboard.descPlaceholder')}
                                        value={newDescription}
                                        onChange={(e) => setNewDescription(e.target.value)}
                                        maxLength={200}
                                    />

                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            id="newIsPublic"
                                            checked={newIsPublic}
                                            onChange={(e) => setNewIsPublic(e.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-muji-primary focus:ring-muji-primary"
                                        />
                                        <label htmlFor="newIsPublic" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            {t('dashboard.publicLabel')} - {newIsPublic ? t('dashboard.public') : t('dashboard.private')}
                                        </label>
                                    </div>

                                    <div className="flex justify-end gap-2">
                                        <Button type="button" variant="ghost" onClick={() => setIsCreateExpanded(false)}>
                                            {t('common.cancel')}
                                        </Button>
                                        <Button disabled={creating || !newTitle}>
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
            ) : filteredWishlists.length === 0 && !creating && !loading ? (
                <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-200">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Gift className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-1">{searchQuery ? "No results found" : t('dashboard.noWishlists')}</h3>
                    <p className="text-gray-500 mb-6 max-w-sm mx-auto">{searchQuery ? "Try a different keyword" : t('dashboard.createFirstDesc')}</p>
                    {!searchQuery && (
                        <Button onClick={() => setIsCreateExpanded(true)} className="animate-bounce">
                            {t('dashboard.createNew')}
                        </Button>
                    )}
                </div>
            ) : (
                { isOwner && (
                    <div className="flex gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            onClick={(e) => {
                                e.preventDefault();
                                handleTogglePrivacy(list.id, list.isPublic);
                            }}
                            title={list.isPublic ? "Make Private" : "Make Public"}
                        >
                            {list.isPublic ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
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
                    </div >
                )
}
        </CardFooter >
                            </Card >
                        </div >
                    ))
}
                </div >
            )}

<DeleteConfirmModal
    isOpen={deleteModalOpen}
    onClose={() => setDeleteModalOpen(false)}
    onConfirm={confirmDelete}
    title={t('dashboard.deleteConfirmTitle')}
    message={t('dashboard.deleteConfirmMsg')}
    isDeleting={isDeleting}
/>

{
    wishlists.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <div className="bg-muji-primary/10 p-4 rounded-full">
                <Gift className="w-12 h-12 text-muji-primary" />
            </div>
            <div className="space-y-1">
                <h3 className="text-xl font-bold text-gray-900">{t('dashboard.emptyTitle')}</h3>
                <p className="text-gray-500 max-w-sm mx-auto">{t('dashboard.emptyDesc')}</p>
            </div>
        </div>
    )
}
        </div >
    );
}
