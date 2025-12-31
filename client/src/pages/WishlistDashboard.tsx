import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
// Removed missing WishlistCard import
import { API_URL } from '../config';
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button"; // Added Button
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../components/ui/Card";
import { Eye, EyeOff, Trash2 } from "lucide-react"; // Added Icons

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
                alert("Delete failed");
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

    if (loading) return <div className="p-4 text-center">Loading...</div>;

    // Calculate Total Items
    const totalItems = wishlists.reduce((acc, list) => acc + (list.items?.length || 0), 0);

    return (
        <div className="container mx-auto p-4 space-y-8">
            {/* Header / Dashboard Stats */}
            {isOwner && (
                <div className="grid grid-cols-1 mb-8">
                    <Card className="bg-muji-light border-none">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Total Items</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-muji-primary">
                                <div className="text-2xl font-bold text-muji-primary">
                                    {totalItems} <span className="text-sm text-gray-400 font-normal">/ {user?.isPremium ? '∞' : maxCapacity} (Per List)</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-muji-primary">
                    {isOwner ? "My Wishlists (v2)" : `${targetUserName}'s Public Wishlists`}
                </h1>
            </div>

            {isOwner && (
                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle className="text-xl">Create New Wishlist</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <Input
                                    placeholder="Wishlist Title (e.g. Birthday 2024)"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    maxLength={50}
                                    required
                                />
                                <div className="text-right text-xs text-gray-400 mt-1">
                                    {newTitle.length}/50
                                </div>
                            </div>
                            <Input
                                placeholder="Description (Optional)"
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
                                    公開此清單 (Public) - {newIsPublic ? "所有人可見" : "僅自己可見"}
                                </label>
                            </div>

                            <Button disabled={creating || !newTitle}>
                                {creating ? "Creating..." : "Create Wishlist"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {wishlists.map((list) => (
                    <Link key={list.id} to={`/wishlists/${list.id}`}>
                        <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer relative group">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-lg font-bold truncate pr-6">{list.title}</CardTitle>
                                <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-muji-primary rounded-full">
                                    {list.items?.length || 0}
                                </span>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muji-secondary text-sm line-clamp-2">
                                    {list.description || "No description"}
                                </p>
                            </CardContent>
                            <CardFooter className="flex justify-between items-center">
                                <span className={`text-xs px-2 py-1 rounded ${list.isPublic ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                    {list.isPublic ? "Public" : "Private"}
                                </span>
                                {isOwner && (
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
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                )}
                            </CardFooter>
                        </Card>
                    </Link>
                ))}
            </div>

            <DeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="刪除願望清單"
                message="您確定要刪除整個願望清單嗎？包含其中的所有物品。此操作無法復原。"
                isDeleting={isDeleting}
            />

            {
                wishlists.length === 0 && (
                    <div className="text-center text-muji-secondary py-10">
                        {isOwner ? "You don't have any wishlists yet. Create one above!" : "This user hasn't created any public wishlists."}
                    </div>
                )
            }
        </div >
    );
}
