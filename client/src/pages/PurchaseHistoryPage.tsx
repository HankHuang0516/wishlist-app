
import { useEffect, useState } from "react";
import { API_URL, API_BASE_URL } from '../config';
import { useAuth } from "../context/AuthContext";
import { Card, CardContent } from "../components/ui/Card";
import { ExternalLink, ShoppingBag, User } from "lucide-react";
import { t } from "../utils/localization";

interface PurchasedItem {
    id: number;
    name: string;
    price?: string;
    currency?: string;
    link?: string;
    imageUrl?: string;
    wishlist: {
        title: string;
        user: {
            id: number;
            name: string;
            nicknames?: string;
            avatarUrl?: string;
        };
    };
    updatedAt: string;
}

interface Transaction {
    id: number;
    type: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
}

export default function PurchaseHistoryPage() {
    const { token } = useAuth();
    const [items, setItems] = useState<PurchasedItem[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [itemsRes, txRes] = await Promise.all([
                fetch(`${API_URL}/users/me/purchases`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${API_URL}/users/me/transaction-history`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (itemsRes.ok) setItems(await itemsRes.json());
            if (txRes.ok) setTransactions(await txRes.json());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const getTypeName = (type: string) => {
        switch (type) {
            case 'PREMIUM': return t('settings.premiumTitle');
            case 'LIMIT_WISHLIST': return t('settings.expandList');
            case 'LIMIT_FOLLOWING': return t('settings.expandList'); // Or similar key
            default: return type;
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">{t('common.processing')}</div>;

    return (
        <div className="max-w-4xl mx-auto py-8 space-y-12">

            {/* Account Purchases */}
            <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-amber-100 rounded-full">
                        <ShoppingBag className="w-8 h-8 text-amber-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{t('purchase.accountTitle')}</h1>
                        <p className="text-gray-500">{t('purchase.accountDesc')}</p>
                    </div>
                </div>

                {transactions.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
                        <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <ShoppingBag className="w-8 h-8 text-gray-300" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-1">{t('purchase.emptyTitle')}</h3>
                        <p className="text-gray-500 text-sm max-w-xs mx-auto">{t('purchase.emptyDesc')}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Mobile View: Cards */}
                        <div className="md:hidden space-y-4">
                            {transactions.map(tx => (
                                <Card key={tx.id} className="bg-white">
                                    <CardContent className="p-4 flex justify-between items-center">
                                        <div>
                                            <p className="font-medium text-gray-900">{getTypeName(tx.type)}</p>
                                            <p className="text-xs text-gray-500">
                                                {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString()}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-mono font-medium text-gray-900">{tx.currency} {tx.amount}</p>
                                            <span className="inline-block px-2 py-0.5 mt-1 rounded-full bg-green-100 text-green-700 text-[10px] font-bold border border-green-200">
                                                {tx.status}
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {/* Desktop View: Table */}
                        <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <table className="w-full text-left bg-white">
                                <thead className="bg-gray-50 text-gray-500 font-medium text-xs uppercase tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">{t('common.item')}</th>
                                        <th className="px-6 py-4">{t('common.date')}</th>
                                        <th className="px-6 py-4 text-right">{t('common.amount')}</th>
                                        <th className="px-6 py-4 text-center">{t('common.status')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {transactions.map(tx => (
                                        <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-gray-900">{getTypeName(tx.type)}</td>
                                            <td className="px-6 py-4 text-gray-500 text-sm">{new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString()}</td>
                                            <td className="px-6 py-4 text-right font-mono font-medium">{tx.currency} {tx.amount}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold border border-green-200">
                                                    {tx.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Gift Purchases */}
            <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-green-100 rounded-full">
                        <User className="w-8 h-8 text-green-600" />
                    </div>
                    {/* Purchased Items Section */}
                    <h2 className="text-xl font-bold text-muji-primary mb-4 flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5" />
                        {t('common.purchases') || "Purchased Items"}
                    </h2>

                    {items.length === 0 ? (
                        <Card className="mb-8 bg-gray-50 border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-8 text-gray-500">
                                <p>{t('common.noPurchases') || "No items purchased yet."}</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="overflow-x-auto -mx-4 md:mx-0">
                            <div className="min-w-[600px] px-4 md:px-0">
                                <div className="grid gap-4 mb-8">
                                    {items.map(item => (
                                        <Card key={item.id} className="overflow-hidden hover:shadow-md transition-shadow">
                                            <div className="flex flex-row">
                                                {/* Image */}
                                                <div className="w-24 h-24 bg-gray-100 flex-shrink-0">
                                                    {item.imageUrl ? (
                                                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                            <Gift className="w-8 h-8" />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 p-4 flex flex-col justify-between">
                                                    <div>
                                                        <div className="flex justify-between items-start">
                                                            <h3 className="font-bold text-lg text-muji-primary line-clamp-1">{item.name}</h3>
                                                            {item.price && (
                                                                <span className="font-semibold text-green-600">
                                                                    {item.currency} {item.price}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                                                            <User className="w-3 h-3" />
                                                            <span>From: {item.wishlist.user.nicknames || item.wishlist.user.name}</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-end mt-2">
                                                        <span className="text-xs text-gray-400">
                                                            {new Date(item.updatedAt).toLocaleDateString()}
                                                        </span>
                                                        {item.link && (
                                                            <a
                                                                href={item.link}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-blue-500 hover:underline flex items-center gap-1 text-sm"
                                                            >
                                                                Visit Link <ExternalLink className="w-3 h-3" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}rel="noopener noreferrer"
                    className="flex items-center justify-center w-full mt-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded py-1 hover:bg-blue-50 transition-colors"
                                        >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    {t('common.viewItem')}
                </a>
            </CardContent>
        </Card>
    ))
}
                    </div >
                )}
            </div >
        </div >
    );
}
