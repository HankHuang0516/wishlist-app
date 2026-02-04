import { ArrowLeft, Bug, Lightbulb, Shield, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { changelogData } from "../data/changelog";
import { t } from "../utils/localization";

export default function ChangelogPage() {
    const getIcon = (type: string) => {
        switch (type) {
            case 'Fix': return <Bug className="w-4 h-4 text-red-500" />;
            case 'Enhancement': return <Lightbulb className="w-4 h-4 text-amber-500" />;
            case 'New': return <Sparkles className="w-4 h-4 text-green-500" />;
            case 'Security': return <Shield className="w-4 h-4 text-blue-500" />;
            default: return <Sparkles className="w-4 h-4 text-gray-500" />;
        }
    };

    const getBadgeColor = (type: string) => {
        switch (type) {
            case 'Frontend': return 'bg-blue-100 text-blue-800';
            case 'Backend': return 'bg-purple-100 text-purple-800';
            case 'Fullstack': return 'bg-indigo-100 text-indigo-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="flex items-center gap-4 mb-8">
                <Link to="/" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft className="w-6 h-6 text-gray-600" />
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">進版日誌 (Changelog)</h1>
            </div>

            <div className="space-y-8">
                {changelogData.map((entry, index) => (
                    <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                                <span className="font-mono text-lg font-bold text-gray-900">v{entry.version}</span>
                                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${getBadgeColor(entry.type)}`}>
                                    {entry.type}
                                </span>
                            </div>
                            <span className="text-sm text-gray-500">{entry.date}</span>
                        </div>

                        <div className="p-6">
                            <h2 className="text-xl font-semibold text-gray-800 mb-4">{entry.title}</h2>

                            <div className="space-y-3 mb-6">
                                {entry.items.map((item, i) => (
                                    <div key={i} className="flex items-start gap-3">
                                        <div className="mt-1 shrink-0">
                                            {getIcon(item.type)}
                                        </div>
                                        <span className="text-gray-700 leading-relaxed">{item.content}</span>
                                    </div>
                                ))}
                            </div>

                            {(entry.verificationCase || entry.details) && (
                                <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
                                    {entry.verificationCase && (
                                        <div className="text-sm">
                                            <span className="font-semibold text-gray-500">驗證案例: </span>
                                            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 ml-1">{entry.verificationCase}</code>
                                        </div>
                                    )}
                                    {entry.details && (
                                        <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                                            <p>{entry.details}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
