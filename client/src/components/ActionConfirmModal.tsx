
import { Button } from "./ui/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/Card";

interface ActionConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isProcessing?: boolean;
    variant?: "primary" | "destructive" | "default"; // "default" maps to primary usually
}

export default function ActionConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "確認 (Confirm)",
    cancelText = "取消 (Cancel)",
    isProcessing = false,
    variant = "primary"
}: ActionConfirmModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
            <Card className="w-full max-w-sm bg-white shadow-xl animate-in fade-in zoom-in-95 duration-200">
                <CardHeader>
                    <CardTitle className={variant === 'destructive' ? "text-red-600" : "text-gray-900"}>
                        {title}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-gray-600 font-medium whitespace-pre-wrap leading-relaxed">
                        {message}
                    </p>
                </CardContent>
                <CardFooter className="flex justify-end gap-2 bg-gray-50 rounded-b-lg">
                    <Button variant="secondary" onClick={onClose} disabled={isProcessing}>
                        {cancelText}
                    </Button>
                    <Button
                        variant={variant === 'destructive' ? 'destructive' : 'primary'}
                        onClick={onConfirm}
                        disabled={isProcessing}
                    >
                        {isProcessing ? "處理中..." : confirmText}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
