
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { API_URL } from '../config';
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/Card";
import { ArrowLeft, KeyRound, Smartphone } from "lucide-react";
import { t } from "../utils/localization";

export default function ForgotPasswordPage() {
    const navigate = useNavigate();
    const [step, setStep] = useState<"phone" | "reset">("phone");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccessMessage("");
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber })
            });
            const data = await res.json();

            if (res.ok) {
                setSuccessMessage(t('auth.codeSent'));
                setTimeout(() => {
                    setStep("reset");
                    setSuccessMessage("");
                }, 1500);
            } else {
                setError(data.error || t('common.error'));
            }
        } catch (e) {
            setError(t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccessMessage("");
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber, otp, newPassword })
            });
            const data = await res.json();

            if (res.ok) {
                setSuccessMessage(t('auth.resetSuccess'));
                setTimeout(() => navigate('/login'), 2000);
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
                            {step === "phone" ? t('forgot.title') : t('forgot.resetPassword')}
                        </CardTitle>
                    </div>
                    <CardDescription>
                        {step === "phone"
                            ? t('forgot.subtitle')
                            : t('forgot.enterOtpDesc')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm font-medium border border-red-200">
                            {error}
                        </div>
                    )}
                    {successMessage && (
                        <div className="bg-green-50 text-green-600 p-3 rounded mb-4 text-sm font-medium border border-green-200 animate-in fade-in slide-in-from-top-2">
                            {successMessage}
                        </div>
                    )}

                    {step === "phone" ? (
                        <form onSubmit={handleSendOtp} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">{t('login.phoneNumber')}</label>
                                <div className="relative">
                                    <Smartphone className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                    <Input
                                        placeholder="0912345678"
                                        className="pl-10"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <Button className="w-full" type="submit" disabled={loading}>
                                {loading ? t('common.processing') : t('forgot.sendCode')}
                            </Button>
                        </form>
                    ) : (
                        <form onSubmit={handleResetPassword} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">{t('login.phoneNumber')}</label>
                                <Input value={phoneNumber} disabled className="bg-gray-100" />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">{t('forgot.enterOtp')}</label>
                                <div className="relative">
                                    <KeyRound className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                    <Input
                                        placeholder="123456"
                                        className="pl-10"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">{t('forgot.newPassword')}</label>
                                <Input
                                    type="password"
                                    placeholder={t('forgot.newPassword')}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    minLength={6}
                                />
                            </div>

                            <Button className="w-full" type="submit" disabled={loading}>
                                {loading ? t('forgot.resetting') : t('forgot.resetPassword')}
                            </Button>

                            <Button
                                type="button"
                                variant="ghost"
                                className="w-full text-sm text-gray-500"
                                onClick={() => setStep("phone")}
                            >
                                {t('common.back')}
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
