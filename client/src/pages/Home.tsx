import { useState, useEffect } from "react";
import { Button } from "../components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/Card";
import { Link } from "react-router-dom";
import { API_URL, API_BASE_URL } from '../config';
import { Info, Gift } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getNextHoliday, t } from "../utils/localization";

export default function Home() {
    const { isAuthenticated, token } = useAuth();
    const [upcomingBirthdays, setUpcomingBirthdays] = useState<any[]>([]);
    const nextHoliday = getNextHoliday();

    useEffect(() => {
        if (isAuthenticated) {
            fetchBirthdays();
        }
    }, [isAuthenticated]);

    const fetchBirthdays = async () => {
        try {
            const res = await fetch(`${API_URL}/users/upcoming-birthdays`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUpcomingBirthdays(data);
            }
        } catch (error) {
            console.error(error);
        }
    };

    if (isAuthenticated) {
        return (
            <div className="container mx-auto p-4 space-y-8">
                <h1 className="text-3xl font-bold text-muji-primary">Welcome Back.</h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Holiday Card */}
                    <Card className="bg-pink-50 border-none shadow-sm h-full">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg font-medium text-pink-600">Upcoming Holiday</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-pink-700">
                                {nextHoliday.name}
                            </div>
                            <p className="text-lg text-pink-500 mt-2">
                                {nextHoliday.date.toLocaleDateString()}
                            </p>
                        </CardContent>
                    </Card>

                    {/* Birthdays Card */}
                    <Card className="bg-blue-50 border-none shadow-sm h-full">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg font-medium text-blue-600">Upcoming Friend Birthdays</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 max-h-[300px] overflow-y-auto">
                            {upcomingBirthdays.length > 0 ? upcomingBirthdays.map(friend => (
                                <div key={friend.id} className="flex items-center bg-white p-3 rounded-lg shadow-sm">
                                    {/* Avatar */}
                                    <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 border border-gray-100 mr-3">
                                        {friend.avatarUrl ? (
                                            <img src={`${API_BASE_URL}${friend.avatarUrl}`} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center font-bold text-gray-400 text-lg">{friend.name[0]}</div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-base text-gray-900 truncate">{friend.name}</span>
                                        </div>
                                        <div className="text-sm text-gray-500 truncate">
                                            {friend.nicknames || friend.phoneNumber}
                                        </div>
                                        <div className="text-xs text-pink-500 font-medium mt-0.5">
                                            生日: {new Date(friend.nextBirthday).toLocaleDateString()}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center space-x-1 ml-2">
                                        <Link to={`/users/${friend.id}/profile`}>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50">
                                                <Info className="h-4 w-4 stroke-[3px]" />
                                            </Button>
                                        </Link>
                                        <Link to={`/users/${friend.id}/wishlists`}>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-pink-500 hover:text-pink-700 hover:bg-pink-50">
                                                <Gift className="h-4 w-4 stroke-[3px]" />
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            )) : (
                                <p className="text-blue-400">No upcoming birthdays.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="flex justify-center mt-12">
                    <Link to="/dashboard">
                        <Button size="lg" className="w-full md:w-auto px-12">Go to My Wishlists</Button>
                    </Link>
                </div>
            </div>
        );
    }

    // Unauthenticated Landing Page
    return (
        <div className="flex flex-col items-center justify-center space-y-12 py-12">
            <section className="text-center space-y-6 max-w-2xl">
                <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl text-muji-primary">
                    {t('home.title')}
                </h1>
                <p className="text-lg text-muji-secondary mx-auto max-w-[700px]">
                    {t('home.subtitle')}
                </p>
                <div className="flex justify-center space-x-4">
                    <Link to="/login">
                        <Button size="lg">{t('home.getStarted')}</Button>
                    </Link>
                    <Button
                        variant="outline"
                        size="lg"
                        onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                    >
                        {t('home.learnMore')}
                    </Button>
                </div>
            </section>

            {/* Feature Preview */}
            <div id="features" className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                {/* Feature 1: AI Photo */}
                <Card className="overflow-hidden hover:shadow-lg transition-shadow border-0 bg-gradient-to-b from-pink-50 to-white">
                    <div className="h-32 md:h-48 overflow-hidden">
                        <img
                            src="/features/feature1.png"
                            alt={t('home.feature1.title')}
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <CardContent className="text-center p-4">
                        <h3 className="font-bold text-lg text-muji-primary">{t('home.feature1.title')}</h3>
                        <p className="text-sm text-muji-secondary mt-2">
                            {t('home.feature1.desc')}
                        </p>
                    </CardContent>
                </Card>

                {/* Feature 2: Share with Friends */}
                <Card className="overflow-hidden hover:shadow-lg transition-shadow border-0 bg-gradient-to-b from-purple-50 to-white">
                    <div className="h-32 md:h-48 overflow-hidden">
                        <img
                            src="/features/feature2.png"
                            alt={t('home.feature2.title')}
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <CardContent className="text-center p-4">
                        <h3 className="font-bold text-lg text-muji-primary">{t('home.feature2.title')}</h3>
                        <p className="text-sm text-muji-secondary mt-2">
                            {t('home.feature2.desc')}
                        </p>
                    </CardContent>
                </Card>

                {/* Feature 3: Organize */}
                <Card className="overflow-hidden hover:shadow-lg transition-shadow border-0 bg-gradient-to-b from-green-50 to-white">
                    <div className="h-32 md:h-48 overflow-hidden">
                        <img
                            src="/features/feature3.png"
                            alt={t('home.feature3.title')}
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <CardContent className="text-center p-4">
                        <h3 className="font-bold text-lg text-muji-primary">{t('home.feature3.title')}</h3>
                        <p className="text-sm text-muji-secondary mt-2">
                            {t('home.feature3.desc')}
                        </p>
                    </CardContent>
                </Card>

                {/* Feature 4: Couple Gift */}
                <Card className="overflow-hidden hover:shadow-lg transition-shadow border-0 bg-gradient-to-b from-red-50 to-white">
                    <div className="h-32 md:h-48 overflow-hidden">
                        <img
                            src="/features/feature4.png"
                            alt={t('home.feature4.title')}
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <CardContent className="text-center p-4">
                        <h3 className="font-bold text-lg text-muji-primary">{t('home.feature4.title')}</h3>
                        <p className="text-sm text-muji-secondary mt-2">
                            {t('home.feature4.desc')}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* AI Integration CTA */}
            <div className="w-full max-w-4xl mt-8">
                <Link to="/api-showcase">
                    <Card className="overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1 border-0 bg-gradient-to-r from-blue-500 to-purple-600 cursor-pointer">
                        <CardContent className="p-6 md:p-8 text-center text-white">
                            <div className="flex items-center justify-center gap-3 mb-3">
                                <span className="text-3xl">🤖</span>
                                <h3 className="font-bold text-xl md:text-2xl">AI 整合 · 公開 API</h3>
                            </div>
                            <p className="text-white/80 text-sm md:text-base">
                                讓 AI Agent（ChatGPT、Claude）幫你管理願望清單，送禮不用猜！

                            </p>
                            <Button className="mt-4 bg-white text-blue-600 hover:bg-gray-100 font-semibold">
                                查看 API 文件 →
                            </Button>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    );
}
