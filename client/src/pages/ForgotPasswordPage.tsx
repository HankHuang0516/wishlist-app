
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { API_URL } from '../config';
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/Card";
import { ArrowLeft, Mail, CheckCircle } from "lucide-react";
import { t } from "../utils/localization";

export default function ForgotPasswordPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);

    const handleSendResetLink = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccessMessage("");
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();

            if (res.ok) {
                setSent(true);
                setSuccessMessage(data.message || 'Reset link sent! Check your email.');
            } else {
                setError(data.error || t('common.error'));
            }
        } catch (e) {
            setError(t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-muji-bg flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-white shadow-xl border-t-4 border-t-muji-primary">
                <CardHeader className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="p-0 h-8 w-8" onClick={() => navigate('/login')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <CardTitle className="text-2xl font-bold text-muji-primary">
                            {t('forgot.title')}
                        </CardTitle>
                    </div>
                    <CardDescription>
                        {t('forgot.description')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm font-medium border border-red-200">
                            {error}
                        </div>
                    )}

                    {sent ? (
                        <div className="flex flex-col items-center gap-4 py-8 text-center">
                            <div className="bg-green-100 p-3 rounded-full">
                                <CheckCircle className="w-10 h-10 text-green-600" />
                            </div>
                            <p className="text-lg font-medium">{successMessage}</p>
                            <p className="text-sm text-gray-500">
                                {t('forgot.checkInbox')}
                            </p>
                            <Button variant="outline" onClick={() => navigate('/login')} className="mt-4">
                                {t('forgot.backToLogin')}
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSendResetLink} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">{t('forgot.emailLabel')}</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                    <Input
                                        type="email"
                                        placeholder="name@example.com"
                                        className="pl-10"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <Button className="w-full" type="submit" disabled={loading}>
                                {loading ? t('common.processing') : t('forgot.submitButton')}
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
