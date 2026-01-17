import { API_URL } from '../config';
import { useState } from 'react';
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/Card";
import { useAuth } from "../context/AuthContext";
import { t, getUserLocale } from "../utils/localization";
interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
    const { token } = useAuth();
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ message: string, aiAnalysis: string } | null>(null);
    const [error, setError] = useState("");

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!content.trim()) return;
        setLoading(true);
        setError("");

        try {
            const res = await fetch(`${API_URL}/feedback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    content,
                    language: getUserLocale()
                })
            });

            if (res.ok) {
                const data = await res.json();
                setResult(data);
                setContent(""); // Clear input
            } else {
                const data = await res.json();
                setError(data.error || "Submission failed");
            }
        } catch (err) {
            console.error(err);
            setError("Network error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-lg bg-white">
                <CardHeader>
                    <CardTitle>{t('feedback.title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {result ? (
                        <div className="bg-green-50 p-4 rounded-lg space-y-4">
                            <h3 className="font-bold text-green-800">{t('feedback.success')}</h3>
                            <p className="text-sm text-green-700">{result.message}</p>

                            {result.aiAnalysis && (
                                <div className="mt-4 border-t border-green-200 pt-2">
                                    <h4 className="font-semibold text-green-800 text-sm mb-1">{t('feedback.aiReply')}</h4>
                                    <pre className="text-sm text-green-900 whitespace-pre-wrap font-sans bg-green-100 p-3 rounded leading-relaxed">
                                        {result.aiAnalysis}
                                    </pre>
                                </div>
                            )}
                            <Button onClick={onClose} className="w-full mt-4">{t('feedback.close')}</Button>
                        </div>
                    ) : (
                        <>
                            <textarea
                                className="w-full border rounded-md p-3 min-h-[150px] resize-none focus:outline-none focus:ring-2 focus:ring-muji-primary"
                                placeholder={t('feedback.placeholder')}
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                disabled={loading}
                            />
                            {error && <p className="text-red-500 text-sm">{error}</p>}
                            <p className="text-xs text-gray-500">
                                {t('feedback.note')}
                            </p>
                        </>
                    )}
                </CardContent>
                {!result && (
                    <CardFooter className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={loading}>{t('feedback.cancel')}</Button>
                        <Button onClick={handleSubmit} disabled={loading || !content.trim()}>
                            {loading ? t('feedback.submitting') : t('feedback.submit')}
                        </Button>
                    </CardFooter>
                )}
            </Card>
        </div>
    );
}
