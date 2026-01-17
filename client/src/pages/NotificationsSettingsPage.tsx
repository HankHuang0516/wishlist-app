import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { t } from "../utils/localization";

export default function NotificationsSettingsPage() {
    const navigate = useNavigate();
    const [marketingEnabled, setMarketingEnabled] = useState(() => {
        return localStorage.getItem('notif_marketing') !== 'false';
    });
    const [saved, setSaved] = useState(false);

    const handleToggle = (checked: boolean) => {
        setMarketingEnabled(checked);
        localStorage.setItem('notif_marketing', String(checked));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
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
                        {saved && <span className="text-xs text-green-600 font-medium animate-pulse">{t('common.saved')}</span>}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700 cursor-pointer" htmlFor="marketing">
                            {t('settings.notifMarketing')}
                        </label>
                        <input
                            id="marketing"
                            type="checkbox"
                            className="h-5 w-5 text-muji-primary rounded focus:ring-muji-primary cursor-pointer"
                            checked={marketingEnabled}
                            onChange={(e) => handleToggle(e.target.checked)}
                        />
                    </div>
                    <div className="flex items-center justify-between opacity-50">
                        <label className="text-sm font-medium text-gray-700">
                            {t('settings.notifSecurity')} <span className="text-xs text-red-500 ml-1">{t('settings.securityMandatory')}</span>
                        </label>
                        <input type="checkbox" className="h-5 w-5 text-muji-primary rounded focus:ring-muji-primary" defaultChecked disabled />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
