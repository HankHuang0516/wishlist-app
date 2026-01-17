import { ArrowLeft, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { t } from "../utils/localization";

export default function NotificationsSettingsPage() {
    const navigate = useNavigate();
    const [marketingEnabled, setMarketingEnabled] = useState(false);
    const [securityEnabled, setSecurityEnabled] = useState(true);
    const [feedback, setFeedback] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

    // Mock fetch initial settings
    useEffect(() => {
        // In reality, fetch from API
    }, []);

    const handleToggle = (checked: boolean) => {
        setMarketingEnabled(checked);
        // Simulate API call
        setTimeout(() => {
            setFeedback({ message: t('common.saved'), type: 'success' });
            setTimeout(() => setFeedback(null), 3000);
        }, 500);
    };

    return (
        <div className="container mx-auto p-4 max-w-2xl">
            <Button variant="ghost" className="mb-4 pl-0 hover:bg-transparent" onClick={() => navigate('/settings')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('common.back')}
            </Button>

            <h1 className="text-2xl font-bold text-muji-primary mb-6">{t('settings.notifications')}</h1>

            <Card className="bg-white">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-lg">{t('settings.emailNotifs')}</CardTitle>
                        {saved && (
                            <span className="text-sm text-green-600 font-bold flex items-center animate-in fade-in slide-in-from-top-1">
                                <Check className="w-4 h-4 mr-1" />
                                {t('common.saved')}
                            </span>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <label className="text-sm font-medium text-gray-700 cursor-pointer" htmlFor="marketing">
                                {t('settings.notifMarketing')}
                            </label>
                            <p className="text-xs text-gray-500 mt-0.5">Receive updates about new features and prompts.</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                id="marketing"
                                type="checkbox"
                                className="sr-only peer"
                                checked={marketingEnabled}
                                onChange={(e) => handleToggle(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-muji-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-muji-primary"></div>
                        </label>
                    </div>
                    <div className="flex items-center justify-between opacity-50">
                        <label className="text-sm font-medium text-gray-700">
                            {t('settings.notifSecurity')} <span className="text-xs text-red-500 ml-1">{t('settings.securityMandatory')}</span>
                            <p className="text-xs text-gray-500 mt-0.5 font-normal">Important alerts about your account security.</p>
                        </label>
                        <input type="checkbox" className="h-5 w-5 text-muji-primary rounded focus:ring-muji-primary" defaultChecked disabled />
                    </div>
                </CardContent>
            </Card>

            {/* Feedback Toast */}
            {feedback && (
                <div className={`fixed bottom-24 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded shadow-lg z-50 text-sm animate-in fade-in slide-in-from-bottom-2 ${feedback.type === 'success' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'}`}>
                    {feedback.message}
                </div>
            )}
        </div>
    );
}
