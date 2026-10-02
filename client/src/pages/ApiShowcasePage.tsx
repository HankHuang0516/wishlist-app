import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Copy, Check, Gift, Heart, ShoppingCart, Sparkles, ArrowRight } from 'lucide-react';
import { integrationApiBase } from '../lib/aiIntegrationWeb';
import { apiText as at } from '../lib/publicApiCopy';

const ApiShowcasePage = () => {
    const [copied, setCopied] = useState(false), [busy, setBusy] = useState(false), [copyError, setCopyError] = useState(false);
    const active = useRef(true), gate = useRef(false);
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    let apiUrl = ''; try { apiUrl = integrationApiBase(); } catch { /* Invalid configuration is never copied. */ }
    const handleCopy = async () => {
        if (gate.current || !apiUrl) return;
        gate.current = true; setBusy(true); setCopied(false); setCopyError(false);
        try { await navigator.clipboard.writeText(apiUrl); if (active.current) setCopied(true); }
        catch { if (active.current) setCopyError(true); }
        finally { if (active.current) { gate.current = false; setBusy(false); } }
    };

    const useCases = [
        {
            icon: <Gift className="w-8 h-8" />,
            title: at('你想要什麼禮物？'),
            description: at('直接跟 AI Agent 溝通'),
            detail: at('願望可存到帳號清單；朋友或工具只能讀取權限允許的內容。'),
            gradient: 'from-blue-500 to-cyan-400',
            bgGradient: 'from-blue-50 to-cyan-50',
            status: 'available',
        },
        {
            icon: <Heart className="w-8 h-8" />,
            title: at('情人節送禮困擾？'),
            description: at('不知道要送什麼禮物？'),
            detail: at('提供個人金鑰的工具可協助讀取公開清單；私人資料仍受帳號與公開權限限制。'),
            gradient: 'from-pink-500 to-rose-400',
            bgGradient: 'from-pink-50 to-rose-50',
            status: 'available',
        },
        {
            icon: <ShoppingCart className="w-8 h-8" />,
            title: at('買禮物給朋友？'),
            description: at('先查看朋友公開的願望清單'),
            detail: at('站內付款與自動配送尚未開通。可使用商品原連結自行到商家購買，並另行確認配送。'),
            gradient: 'from-purple-500 to-indigo-400',
            bgGradient: 'from-purple-50 to-indigo-50',
            status: 'ucp',
        },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
            {/* Hero Section */}
            <div className="max-w-4xl mx-auto px-4 pt-12 pb-8">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700 text-sm font-medium mb-6">
                        <Sparkles className="w-4 h-4" />
                        {at('API 整合與權限控管')}
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                        {at('讓 AI Agent 管理你的')}
                        <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"> {at('願望清單')}</span>
                    </h1>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                        {at('複製 API 連結，再到設定取得個人指令以授權信任的工具。')}
                    </p>
                </div>

                {/* API URL Copy Section */}
                <Card className="max-w-2xl mx-auto border-2 border-blue-100 shadow-lg shadow-blue-100/50 overflow-hidden">
                    <CardContent className="p-0">
                        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
                            <p className="text-white/90 text-sm font-medium">{at('🔗 API 端點')}</p>
                        </div>
                        <div className="p-6">
                            <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-4 border border-gray-200">
                                <code className="flex-1 text-sm md:text-base font-mono text-gray-800 break-all select-all">
                                    {apiUrl || at('API 網址目前無法使用。')}
                                </code>
                                <Button
                                    onClick={handleCopy}
                                    disabled={busy || !apiUrl}
                                    className={`min-h-11 shrink-0 transition-all duration-300 ${copied
                                        ? 'bg-green-500 hover:bg-green-600'
                                        : 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600'
                                        } text-white`}
                                >
                                    {copied ? (
                                        <>
                                            <Check className="w-4 h-4 mr-2" />
                                            {at('已複製')}
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4 mr-2" />
                                            {at('複製')}
                                        </>
                                    )}
                                </Button>
                            </div>
                            {copyError && <p role="alert" className="mt-3 text-sm">{at('無法複製連結，請選取上方網址自行複製。')}</p>}
                            {copied && <p role="status" className="sr-only">{at('已複製')}</p>}
                            <p className="text-center text-gray-500 text-sm mt-4">
                                {at('連結不含登入權限；私有操作需要有效憑證與各端點權限。')}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Use Cases Section */}
            <div className="max-w-6xl mx-auto px-4 py-12">
                <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-10">
                    {at('三種使用場景')}
                </h2>

                <div className="grid md:grid-cols-3 gap-6">
                    {useCases.map((useCase, index) => (
                        <Card
                            key={index}
                            className={`relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-gradient-to-br ${useCase.bgGradient}`}
                        >
                            <CardHeader className="pb-2">
                                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-r ${useCase.gradient} text-white mb-4 shadow-lg`}>
                                    {useCase.icon}
                                </div>
                                <CardTitle className="text-xl text-gray-900">
                                    {useCase.title}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <p className="text-gray-700 font-medium">
                                    {useCase.description}
                                </p>
                                <p className="text-gray-600 text-sm leading-relaxed">
                                    {useCase.detail}
                                </p>
                                <div className="pt-2">
                                    {useCase.status === 'available' ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                                            <Check className="w-3.5 h-3.5" />
                                            {at('在權限允許時可使用')}
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                                            <Sparkles className="w-3.5 h-3.5" />
                                            {at('站內付款與自動配送未開通')}
                                        </span>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* CTA Section */}
            <div className="max-w-4xl mx-auto px-4 py-12 pb-24">
                <Card className="bg-gradient-to-r from-blue-600 to-purple-600 border-0 shadow-2xl">
                    <CardContent className="p-8 md:p-12 text-center">
                        <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                            {at('準備好開始了嗎？')}
                        </h3>
                        <p className="text-white/80 mb-8 max-w-lg mx-auto">
                            {at('建立帳號後，可在設定取得含個人金鑰的指令，只交給信任的工具。')}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link to="/register" className="inline-flex min-h-11 items-center justify-center rounded-md bg-white text-blue-600 hover:bg-gray-100 font-semibold px-8 py-3 text-base">
                                    {at('免費註冊')}
                                    <ArrowRight className="w-4 h-4 ml-2" />
                            </Link>
                            <Link to="/api-docs" className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/30 text-white hover:bg-white/10 font-medium px-8 py-3 text-base">
                                    {at('查看完整 API 文件')}
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default ApiShowcasePage;
