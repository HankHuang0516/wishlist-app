import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import { API_URL } from '../config';
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "../components/ui/Card";
import { t } from "../utils/localization";
import { Eye, EyeOff } from "lucide-react";

export default function Login() {
    const [identifier, setIdentifier] = useState(""); // phone or email
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showResendOption, setShowResendOption] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendSuccess, setResendSuccess] = useState("");
    const { login, isAuthenticated } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/dashboard');
        }
    }, [isAuthenticated, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setShowResendOption(false);
        setResendSuccess("");
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: identifier, password }),
            });

            // Safely parse response - handle non-JSON responses
            let data;
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await res.json();
            } else {
                const text = await res.text();
                data = { error: text || 'An unexpected error occurred' };
            }

            if (!res.ok) {
                // Check if it's email verification error
                if (res.status === 403 && data.error?.includes('verify your email')) {
                    setShowResendOption(true);
                }
                throw new Error(data.error || 'Login failed');
            }

            login(data.token, data.user);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResendVerification = async () => {
        // Use identifier as email if it contains @, otherwise show message
        const email = identifier.includes('@') ? identifier : '';
        if (!email) {
            setError(t('login.enterEmailToResend'));
            return;
        }

        setResendLoading(true);
        setResendSuccess("");
        try {
            const res = await fetch(`${API_URL}/auth/resend-verification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();
            if (res.ok) {
                setResendSuccess(t('login.verificationSent'));
                setError("");
            } else {
                setError(data.error || t('login.resendFailed'));
            }
        } catch {
            setError(t('login.resendFailed'));
        } finally {
            setResendLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-[60vh] pb-10">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl">{t('login.title')}</CardTitle>
                    <p className="text-sm text-muji-secondary">{t('login.subtitle')}</p>
                </CardHeader>
                <form onSubmit={handleSubmit} className={error ? "animate-shake" : ""}>
                    <CardContent className="space-y-4">
                        {error && <div className="text-red-500 text-sm text-center font-medium bg-red-50 p-2 rounded">{error}</div>}
                        {resendSuccess && <div className="text-green-600 text-sm text-center font-medium bg-green-50 p-2 rounded">{resendSuccess}</div>}
                        {showResendOption && (
                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={handleResendVerification}
                                    disabled={resendLoading}
                                    className="text-sm text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
                                >
                                    {resendLoading ? t('login.sendingVerification') : t('login.resendVerification')}
                                </button>
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none" htmlFor="identifier">{t('login.phoneOrEmail')}</label>
                            <Input
                                id="identifier"
                                placeholder={t('login.phoneOrEmailPlaceholder')}
                                type="text"
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none" htmlFor="password">{t('login.password')}</label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-0 top-0 h-full px-3 text-gray-400 hover:text-gray-600 flex items-center justify-center min-w-[44px]"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Link to="/forgot-password" className="text-sm text-muji-secondary hover:text-muji-primary">{t('login.forgotPassword')}</Link>
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-4">
                        <Button className="w-full" disabled={loading}>
                            {loading ? t('login.signingIn') : t('login.signIn')}
                        </Button>
                        <div className="text-center text-sm text-muji-secondary">
                            {t('login.noAccount')} <Link to="/register" className="underline cursor-pointer hover:text-muji-primary">{t('login.signUp')}</Link>
                        </div>
                    </CardFooter>
                </form>
            </Card>
        </div >
    );
}

