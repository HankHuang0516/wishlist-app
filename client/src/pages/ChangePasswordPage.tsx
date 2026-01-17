
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { API_URL } from '../config';
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/Card";
import { ChevronLeft } from "lucide-react";
import { t } from "../utils/localization";

export default function ChangePasswordPage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (newPassword !== confirmPassword) {
            setError(t('changePwd.matchErr'));
            return;
        }

        if (newPassword.length < 6) {
            setError(t('changePwd.lengthErr'));
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/users/me/password`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            if (res.ok) {
                setSuccess(t('auth.pwdUpdated'));
                setTimeout(() => navigate('/settings'), 1500);
            } else {
                const data = await res.json();
                setError(data.error || t('common.error'));
            }
        } catch (err) {
            console.error(err);
            setError(t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto mt-10 space-y-6 pb-20">
            <h1 className="text-2xl font-bold text-center text-muji-primary">{t('settings.changePwd')}</h1>
            <Link to="/settings" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-6">
                <ChevronLeft className="w-4 h-4 mr-1" />
                {t('common.back')}
            </Link>

            <Card>
                <CardHeader>
                    <CardTitle>{t('changePwd.title')}</CardTitle>
                    <CardDescription>{t('changePwd.desc')}</CardDescription>
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="bg-green-50 text-green-600 p-3 rounded-md text-sm mb-4 animate-in fade-in slide-in-from-top-2">
                            {success}
                        </div>
                    )}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('changePwd.current')}</label>
                            <Input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('changePwd.new')}</label>
                            <Input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                autoComplete="new-password"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('changePwd.confirm')}</label>
                            <Input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                autoComplete="new-password"
                            />
                        </div>
                        <Button className="w-full" type="submit" disabled={loading}>
                            {loading ? t('changePwd.updating') : t('changePwd.update')}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
