import { Button } from "../components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/Card";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getNextHoliday, t } from "../utils/localization";
import WishHomeWeb from '../components/WishHomeWeb';
import BirthdayReminders from '../components/BirthdayReminders';
import { homeDate, homeText } from '../lib/homeText';

export default function Home() {
    const { isAuthenticated, token, user } = useAuth();
    const nextHoliday = getNextHoliday();

    if (isAuthenticated) {
        return (
            <div className="mx-auto max-w-6xl">
                {token && user && <WishHomeWeb key={`${user.id}:${token}`} token={token} userId={user.id}>
                <div className="flex flex-wrap justify-center gap-3">
                    <Link to="/wishes" className="inline-flex min-h-11 items-center justify-center rounded-md bg-muji-primary px-12 py-2 text-sm font-medium text-white shadow-sm hover:bg-opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-muji-primary">{homeText('wishes')}</Link>
                    <Link to="/sell" className="inline-flex min-h-11 items-center justify-center rounded-md border border-muji-border px-12 py-2 text-sm font-medium hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-muji-primary">{homeText('sell')}</Link>
                </div>

                <div className="home-reminders grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Holiday Card */}
                    <Card className="bg-pink-50 border-none shadow-sm h-full">
                        <CardHeader className="p-4 pb-1">
                            <CardTitle className="text-xs font-medium text-pink-600">{homeText('holiday')}</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <div className="text-base font-bold text-pink-700">
                                {nextHoliday.name}
                            </div>
                            <p className="text-xs text-pink-500 mt-1">
                                {homeDate(nextHoliday.date)}
                            </p>
                            {nextHoliday.calendarNotice && <p role="status" className="mt-2 text-xs text-pink-700">{nextHoliday.calendarNotice}</p>}
                        </CardContent>
                    </Card>

                    <BirthdayReminders token={token} />
                </div>

                </WishHomeWeb>}
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
                    <Link to="/login" className="inline-flex min-h-12 items-center justify-center rounded-md bg-muji-primary px-8 text-base font-medium text-white focus-visible:outline focus-visible:outline-2">{t('home.getStarted')}</Link>
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
                                <h3 className="font-bold text-xl md:text-2xl">{homeText('integration')}</h3>
                            </div>
                            <p className="text-white/80 text-sm md:text-base">
                                {homeText('integrationDescription')}

                            </p>
                            <span className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-white px-4 text-blue-600 font-semibold">{homeText('api')}</span>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    );
}
