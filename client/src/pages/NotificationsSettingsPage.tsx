import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { t } from "../utils/localization";

export default function NotificationsSettingsPage() {
    const navigate = useNavigate();

    return (
        <div className="container mx-auto p-4 max-w-2xl">
            <Button variant="ghost" className="mb-4 pl-0 hover:bg-transparent" onClick={() => navigate('/settings')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('common.back')}
            </Button>

            <h1 className="text-2xl font-bold text-muji-primary mb-6">{t('settings.notifications')}</h1>

            <Card className="bg-white">
                <CardHeader>
                    <CardTitle className="text-lg">{t('settings.emailNotifs')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700">
                            {t('settings.notifMarketing')}
                        </label>
                        <input type="checkbox" className="h-5 w-5 text-muji-primary rounded focus:ring-muji-primary" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
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
