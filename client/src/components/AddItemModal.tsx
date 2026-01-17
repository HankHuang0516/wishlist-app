import { useState, useRef } from "react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "./ui/Card";
import { useAuth } from "../context/AuthContext";
import { Upload } from "lucide-react";
import { API_URL } from '../config';
import { t } from "../utils/localization";

interface ItemData {
    name: string;
    price: string;
    currency: string;
    imageUrl?: string; // We might get this from AI or use local preview
    notes: string;
    shoppingLink: string;
    tags: string[];
}

interface AddItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (item: ItemData, imageFile?: File) => void;
    wishlistId: number;
}

export default function AddItemModal({ isOpen, onClose, onAdd }: AddItemModalProps) {
    const { token } = useAuth();
    const [step, setStep] = useState<'upload' | 'preview'>('upload');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [previewData, setPreviewData] = useState<ItemData | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("");

    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            setImagePreviewUrl(URL.createObjectURL(file));
            setError("");
        }
    };

    const handleAnalyze = async () => {
        if (!selectedFile) {
            setError("Please select an image");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const formData = new FormData();
            formData.append('image', selectedFile);

            const res = await fetch(`${API_URL}/ai/analyze-image`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                    // Content-Type is set automatically by browser for FormData
                },
                body: formData
            });

            if (!res.ok) throw new Error("Failed to analyze image");

            const data = await res.json();
            setPreviewData({
                ...data,
                imageUrl: imagePreviewUrl // Keep local preview
            });
            setStep('preview');
        } catch (err: any) {
            setError(err.message || "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (previewData) {
            onAdd(previewData, selectedFile || undefined);
            handleClose();
        }
    };

    const handleClose = () => {
        onClose();
        // Reset state
        setStep('upload');
        setSelectedFile(null);
        setImagePreviewUrl("");
        setPreviewData(null);
        setError("");
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md bg-white">
                <CardHeader>
                    <CardTitle>{step === 'upload' ? t('item.addTitle') : t('item.reviewTitle')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {error && <div className="text-red-500 text-sm">{error}</div>}

                    {step === 'upload' ? (
                        <div className="space-y-4 text-center border-2 border-dashed border-gray-300 rounded-lg p-8 hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}>
                            <input
                                type="file"
                                hidden
                                ref={fileInputRef}
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                            {imagePreviewUrl ? (
                                <img src={imagePreviewUrl} alt="Preview" className="max-h-48 mx-auto rounded" />
                            ) : (
                                <div className="flex flex-col items-center text-muji-secondary">
                                    <Upload className="w-12 h-12 mb-2" />
                                    <p>{t('item.clickToUpload')}</p>
                                    <p className="text-xs">{t('item.supports')}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {imagePreviewUrl && (
                                <img src={imagePreviewUrl} alt="Preview" className="w-full h-48 object-contain bg-gray-50 rounded" />
                            )}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('item.name')}</label>
                                <Input
                                    value={previewData?.name || ""}
                                    onChange={(e) => setPreviewData({ ...previewData!, name: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">{t('item.price')}</label>
                                    <Input
                                        value={previewData?.price || ""}
                                        onChange={(e) => setPreviewData({ ...previewData!, price: e.target.value })}
                                        inputMode="decimal"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">{t('item.currency')}</label>
                                    <Input
                                        value={previewData?.currency || "USD"}
                                        onChange={(e) => setPreviewData({ ...previewData!, currency: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('item.link')}</label>
                                <Input
                                    value={previewData?.shoppingLink || ""}
                                    onChange={(e) => setPreviewData({ ...previewData!, shoppingLink: e.target.value })}
                                />
                            </div>
                            {previewData?.tags && (
                                <div className="flex flex-wrap gap-1">
                                    {previewData.tags.map(tag => (
                                        <span key={tag} className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">#{tag}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={handleClose}>{t('common.cancel')}</Button>
                    {step === 'upload' ? (
                        <Button onClick={handleAnalyze} disabled={loading || !selectedFile}>
                            {loading ? t('item.analyzing') : t('item.analyze')}
                        </Button>
                    ) : (
                        <Button onClick={handleSave}>{t('item.save')}</Button>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}
