import * as React from "react"

const TabsContext = React.createContext<{
    value: string;
    onValueChange: (value: string) => void;
}>({ value: "", onValueChange: () => { } });

const Tabs = ({
    defaultValue,
    value,
    onValueChange,
    children,
    className
}: {
    defaultValue?: string;
    value?: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
    className?: string;
}) => {
    const [localValue, setLocalValue] = React.useState(defaultValue || "");
    const currentValue = value !== undefined ? value : localValue;
    const handleChange = onValueChange || setLocalValue;

    return (
        <TabsContext.Provider value={{ value: currentValue, onValueChange: handleChange }}>
            <div className={className}>{children}</div>
        </TabsContext.Provider>
    );
};

const TabsList = ({ className, children }: { className?: string; children: React.ReactNode }) => (
    <div className={`inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1 text-gray-500 ${className || ""}`}>
        {children}
    </div>
);

const TabsTrigger = ({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) => {
    const { value: selectedValue, onValueChange } = React.useContext(TabsContext);
    const isSelected = selectedValue === value;

    return (
        <button
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onValueChange(value)}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${isSelected ? "bg-white text-gray-950 shadow-sm" : "hover:bg-gray-200/50 hover:text-gray-900"
                } ${className || ""}`}
        >
            {children}
        </button>
    );
}

const TabsContent = ({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) => {
    const { value: selectedValue } = React.useContext(TabsContext);
    if (selectedValue !== value) return null;
    return (
        <div className={`mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 ${className || ""}`}>
            {children}
        </div>
    );
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
