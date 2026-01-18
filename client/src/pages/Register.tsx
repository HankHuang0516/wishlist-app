import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { API_URL } from '../config';
import { Input } from "../components/ui/Input";
import { Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "../components/ui/Card";
import { t } from "../utils/localization";

export default function Register() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [birthday, setBirthday] = useState("");

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [successProfile, setSuccessProfile] = useState<{ email: string } | null>(null);

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
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, phoneNumber, password, birthday }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Registration failed');
            }

            // Success - show verification message
            setSuccessProfile({ email });

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (successProfile) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] pb-10">
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <div className="mx-auto bg-green-100 p-3 rounded-full mb-4">
                            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                        </div>
                        <CardTitle className="text-2xl">Verify your email</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-gray-600">
                            We've sent a verification link to <span className="font-semibold text-gray-900">{successProfile.email}</span>.
                        </p>
                        <p className="text-sm text-gray-500">
                            Please check your inbox (and spam folder) and click the link to verify your account.
                        </p>
                    </CardContent>
                    <CardFooter className="justify-center">
                        <Button variant="outline" onClick={() => navigate('/login')}>
                            Back to Login
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center min-h-[60vh] pb-10">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl">{t('register.title')}</CardTitle>
                    <p className="text-sm text-muji-secondary">{t('register.subtitle')}</p>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        {error && <div className="text-red-500 text-sm text-center">{error}</div>}
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none" htmlFor="name">{t('register.name')}</label>
                            <Input
                                id="name"
                                placeholder={t('register.namePlaceholder')}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                className="text-base md:text-sm"
                            />
                        </div>

                        {/* Birthday Field */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none">{t('register.birthday')}</label>
                            <Input
                                type="date"
                                value={birthday}
                                onChange={(e) => setBirthday(e.target.value)}
                                required
                                max={new Date().toISOString().split('T')[0]} // updated to allow selection up to today
                                className="text-base md:text-sm"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none" htmlFor="email">Email</label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="text-base md:text-sm"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none" htmlFor="phoneNumber">{t('register.phoneNumber')}</label>
                            <Input
                                id="phoneNumber"
                                placeholder="0912345678"
                                type="tel"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                required
                                className="text-base md:text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none" htmlFor="password">{t('register.password')}</label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="pr-10 text-base md:text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">{t('register.passwordHint')}</p>
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-4">
                        <Button className="w-full" disabled={loading}>
                            {loading ? t('register.creatingAccount') : t('register.createAccount')}
                        </Button>
                        <div className="text-center text-sm text-muji-secondary">
                            {t('register.hasAccount')} <Link to="/login" className="underline cursor-pointer hover:text-muji-primary">{t('register.signIn')}</Link>
                        </div>
                    </CardFooter>
                </form>
            </Card>
        </div >
    );
}
