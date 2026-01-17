import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { t } from "../utils/localization";

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
            <h1 className="text-6xl font-bold text-gray-200 mb-4">404</h1>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{t('common.error')}</h2>
            <p className="text-gray-500 mb-8 max-w-sm">
                The page you are looking for does not exist or has been moved.
            </p>
            <Link to="/">
                <Button>{t('common.back')}</Button>
            </Link>
        </div>
    );
}
