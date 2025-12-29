import * as React from "react";

import { cn } from "../../lib/utils";

// Note: I need to install class-variance-authority for this to work elegantly, 
// but for now I will stick to simple props or install it. 
// Actually, simple props is fine, but cva is better. 
// I'll use simple conditional logic for now to avoid extra deps if not needed, 
// or I'll just install cva in the next step if I want to be "pro".
// Let's stick to standard clsx for now to be quick.

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "destructive";
    size?: "sm" | "md" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "primary", size = "md", ...props }, ref) => {

        const variants = {
            primary: "bg-muji-primary text-white hover:bg-opacity-90 shadow-sm",
            secondary: "bg-muji-secondary text-white hover:bg-opacity-90 shadow-sm",
            outline: "border border-muji-border text-muji-primary hover:bg-muji-bg",
            ghost: "text-muji-primary hover:bg-muji-bg",
            danger: "bg-muji-accent text-white hover:bg-opacity-90",
            destructive: "bg-red-500 text-white hover:bg-red-600 shadow-sm",
        };

        const sizes = {
            sm: "h-8 px-3 text-xs",
            md: "h-10 px-4 py-2 text-sm",
            lg: "h-12 px-8 text-base",
            icon: "h-10 w-10 p-0",
        };

        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muji-primary disabled:pointer-events-none disabled:opacity-50",
                    variants[variant],
                    sizes[size],
                    className
                )}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";

export { Button };
