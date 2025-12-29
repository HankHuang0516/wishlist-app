import * as React from "react"

const Dialog = ({
    open,
    onOpenChange,
    children
}: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode
}) => {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center sm:items-center">
            <div
                className="fixed inset-0 bg-black/50 transition-opacity"
                onClick={() => onOpenChange && onOpenChange(false)}
            />
            <div className="z-50 w-full rounded-lg bg-white p-6 shadow-lg animate-in fade-in-0 zoom-in-95 sm:max-w-lg">
                {children}
            </div>
        </div>
    )
}

const DialogContent = ({ className, children }: { className?: string; children: React.ReactNode }) => (
    <div className={`relative ${className || ""}`}>{children}</div>
)

const DialogHeader = ({ className, children }: { className?: string; children: React.ReactNode }) => (
    <div className={`flex flex-col space-y-1.5 text-center sm:text-left ${className || ""}`}>
        {children}
    </div>
)

const DialogTitle = ({ className, children }: { className?: string; children: React.ReactNode }) => (
    <h2 className={`text-lg font-semibold leading-none tracking-tight ${className || ""}`}>
        {children}
    </h2>
)

const DialogDescription = ({ className, children }: { className?: string; children: React.ReactNode }) => (
    <p className={`text-sm text-gray-500 ${className || ""}`}>{children}</p>
)

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription }
