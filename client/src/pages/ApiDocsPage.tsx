import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { t } from '../utils/localization';
import { getFullApiUrl } from '../config';

interface ApiItem {
    method: string;
    path: string;
    desc: string;
    body?: string;
    auth?: boolean;
}

interface ApiSection {
    title: string;
    apis: ApiItem[];
}

const ApiDocsPage = () => {

    const apiSections: ApiSection[] = [
        {
            title: '🔐 認證 (Authentication)',
            apis: [
                { method: 'POST', path: '/api/auth/register', desc: '註冊新帳號', body: '{ phoneNumber, password, name? }' },
                { method: 'POST', path: '/api/auth/login', desc: '登入取得 JWT Token', body: '{ phoneNumber, password }' },
                { method: 'POST', path: '/api/auth/forgot-password', desc: '發送密碼重設 OTP', body: '{ phoneNumber }' },
                { method: 'POST', path: '/api/auth/verify-otp', desc: '驗證 OTP', body: '{ phoneNumber, otp }' },
                { method: 'POST', path: '/api/auth/reset-password', desc: '重設密碼', body: '{ phoneNumber, otp, newPassword }' },
            ]
        },
        {
            title: '📋 願望清單 (Wishlists)',
            apis: [
                { method: 'GET', path: '/api/wishlists', desc: '取得所有清單', auth: true },
                { method: 'POST', path: '/api/wishlists', desc: '建立新清單', body: '{ title, description?, isPublic? }', auth: true },
                { method: 'GET', path: '/api/wishlists/:id', desc: '取得單一清單', auth: true },
                { method: 'PUT', path: '/api/wishlists/:id', desc: '更新清單', body: '{ title?, description?, isPublic? }', auth: true },
                { method: 'DELETE', path: '/api/wishlists/:id', desc: '刪除清單', auth: true },
            ]
        },
        {
            title: '🎁 項目 (Items)',
            apis: [
                { method: 'POST', path: '/api/wishlists/:id/items', desc: '新增項目', body: 'multipart/form-data: name, price?, notes?, image?', auth: true },
                { method: 'POST', path: '/api/wishlists/:id/items/url', desc: '從網址自動抓取', body: '{ url }', auth: true },
                { method: 'GET', path: '/api/items/:id', desc: '取得項目詳情', auth: true },
                { method: 'PUT', path: '/api/items/:id', desc: '更新項目', body: '{ name?, price?, notes?, isPurchased? }', auth: true },
                { method: 'DELETE', path: '/api/items/:id', desc: '刪除項目', auth: true },
            ]
        },
        {
            title: '👥 社交 (Social)',
            apis: [
                { method: 'GET', path: '/api/users/search?q=關鍵字', desc: '搜尋用戶', auth: true },
                { method: 'GET', path: '/api/users/following', desc: '取得我追蹤的人', auth: true },
                { method: 'POST', path: '/api/users/:id/follow', desc: '追蹤用戶', auth: true },
                { method: 'DELETE', path: '/api/users/:id/follow', desc: '取消追蹤', auth: true },
                { method: 'GET', path: '/api/users/:id/wishlists', desc: '查看他人公開清單', auth: true },
                { method: 'GET', path: '/api/users/:id/delivery-info', desc: '取得寄送資訊（需互相追蹤）', auth: true },
                { method: 'GET', path: '/api/users/upcoming-birthdays', desc: '即將到來的生日', auth: true },
            ]
        },
        {
            title: '👤 用戶 (User)',
            apis: [
                { method: 'GET', path: '/api/users/me', desc: '取得我的資料', auth: true },
                { method: 'PUT', path: '/api/users/me', desc: '更新我的資料', body: '{ name?, realName?, address?, ... }', auth: true },
                { method: 'POST', path: '/api/users/me/apikey', desc: '產生/重新產生 API Key', auth: true },
                { method: 'GET', path: '/api/users/me/apikey', desc: '取得我的 API Key', auth: true },
                { method: 'POST', path: '/api/users/me/ai-prompt', desc: '產生 AI 指令（含 API Key）', auth: true },
            ]
        },
        {
            title: '🤖 AI 功能',
            apis: [
                { method: 'POST', path: '/api/ai/analyze-image', desc: '分析圖片內容', body: 'multipart/form-data: image', auth: true },
                { method: 'POST', path: '/api/ai/validate-image', desc: '驗證圖片網址', body: '{ url }', auth: true },
            ]
        }
    ];

    const methodColors: Record<string, string> = {
        GET: 'bg-green-100 text-green-800',
        POST: 'bg-blue-100 text-blue-800',
        PUT: 'bg-yellow-100 text-yellow-800',
        DELETE: 'bg-red-100 text-red-800',
    };

    return (
        <div className="max-w-4xl mx-auto p-4 pb-24">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">API 文件</h1>
                <Link to="/settings">
                    <Button variant="outline" size="sm">← 返回設定</Button>
                </Link>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-medium text-blue-800 mb-2">🔑 認證方式</h3>
                <p className="text-sm text-blue-700 mb-2">
                    需要認證的 API 請在 Header 加上以下其一：
                </p>
                <code className="block bg-white p-2 rounded text-sm mb-1">Authorization: Bearer &lt;JWT_TOKEN&gt;</code>
                <code className="block bg-white p-2 rounded text-sm">x-api-key: &lt;API_KEY&gt;</code>
                <p className="text-sm text-blue-600 mt-2">
                    💡 在設定頁面點擊「一鍵複製 AI 指令」可自動取得包含 API Key 的完整指令
                </p>
            </div>

            <div className="bg-gray-50 border rounded-lg p-4 mb-6">
                <h3 className="font-medium mb-2">🌐 Base URL</h3>
                <code className="block bg-white p-2 rounded text-sm select-all">
                    {getFullApiUrl()}
                </code>
                <p className="text-xs text-gray-500 mt-2">
                    ⚠️ 這是 API 路徑的前綴，需搭配下方具體端點使用（例如 /api/auth/login）
                </p>
            </div>

            <div className="space-y-6">
                {apiSections.map((section, idx) => (
                    <Card key={idx}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">{section.title}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {section.apis.map((api, apiIdx) => (
                                    <div key={apiIdx} className="border rounded-lg p-3 bg-gray-50">
                                        <div className="flex items-start gap-2 flex-wrap">
                                            <span className={`px-2 py-1 rounded text-xs font-mono font-bold ${methodColors[api.method]}`}>
                                                {api.method}
                                            </span>
                                            <code className="text-sm font-mono flex-1">{api.path}</code>
                                            {api.auth && (
                                                <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                                                    🔒 需認證
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-600 mt-2">{api.desc}</p>
                                        {api.body && (
                                            <p className="text-xs text-gray-500 mt-1">
                                                Body: <code className="bg-gray-200 px-1 rounded">{api.body}</code>
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default ApiDocsPage;
