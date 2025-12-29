import { Button } from "./ui/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/Card";

interface DeleteConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    isDeleting?: boolean;
}

export default function DeleteConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    isDeleting = false
}: DeleteConfirmModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
            <Card className="w-full max-w-sm bg-white shadow-xl animate-in fade-in zoom-in-95 duration-200">
                <CardHeader>
                    <CardTitle className="text-red-600">{title}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-gray-600 font-medium">{message}</p>
                </CardContent>
                <CardFooter className="flex justify-end gap-2 bg-gray-50 rounded-b-lg">
                    <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
                        取消 (Cancel)
                    </Button>
                    <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
                        {isDeleting ? "刪除中..." : "確認刪除 (Confirm)"}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
