import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { API_URL } from '../config';
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "../components/ui/Card";
import { t } from "../utils/localization";

export default function Register() {
    const [name, setName] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [password, setPassword] = useState("");

    // Birthday State
    const [year, setYear] = useState("");
    const [month, setMonth] = useState("");
    const [day, setDay] = useState("");

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Date Arrays
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 100 }, (_, i) => currentYear - i);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const days = Array.from({ length: 31 }, (_, i) => i + 1);

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
            const birthday = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

            const res = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phoneNumber, password, birthday }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Registration failed');
            }

            login(data.token, data.user);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-[60vh]">
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
                            />
                        </div>

                        {/* Birthday Field */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none">{t('register.birthday')}</label>
                            <div className="flex gap-2">
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={year}
                                    onChange={(e) => setYear(e.target.value)}
                                    required
                                >
                                    <option value="">{t('register.year')}</option>
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={month}
                                    onChange={(e) => setMonth(e.target.value)}
                                    required
                                >
                                    <option value="">{t('register.month')}</option>
                                    {months.map(m => <option key={m} value={m}>{m}月</option>)}
                                </select>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={day}
                                    onChange={(e) => setDay(e.target.value)}
                                    required
                                >
                                    <option value="">{t('register.day')}</option>
                                    {days.map(d => <option key={d} value={d}>{d}日</option>)}
                                </select>
                            </div>
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
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none" htmlFor="password">{t('register.password')}</label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
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
        </div>
    );
}
