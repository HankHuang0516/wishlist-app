import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/Tabs";
import { Smartphone } from "lucide-react";
import { API_URL } from '../config';

// Add global TPDirect type definition manually or just use 'any' for speed
declare const TPDirect: any;

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPaymentSuccess: (result: any) => void;
    amount: number;
    itemName: string;
    extraPayload?: any; // New prop
}

export default function PaymentModal({ isOpen, onClose, onPaymentSuccess, amount, itemName, extraPayload }: PaymentModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sdkReady, setSdkReady] = useState(false);

    // Check if SDK loaded
    useEffect(() => {
        if (!isOpen) return;

        let setupRetries = 0;
        const maxRetries = 20; // 10 seconds

        const initTapPay = () => {
            // If already setup, just clean errors? No, re-setup might be needed if DOM destroyed?
            // Usually setup is one-time per page load, but update uses new elements.

            if (typeof TPDirect !== 'undefined') {
                try {
                    TPDirect.setupSDK(166632, 'app_eLtyNlnXhUY9PkZoJUw8wjU0o7Ts0iCe14YW6CND4AqYmi5hq8KR4PhKL9DA', 'sandbox');

                    // Wait for DOM
                    setTimeout(() => {
                        TPDirect.card.setup({
                            fields: {
                                number: {
                                    element: '#card-number',
                                    placeholder: '**** **** **** ****'
                                },
                                expirationDate: {
                                    element: '#card-expiration-date',
                                    placeholder: 'MM / YY'
                                },
                                ccv: {
                                    element: '#card-ccv',
                                    placeholder: 'CCV'
                                }
                            },
                            styles: {
                                'input': { 'color': 'gray' },
                                '.valid': { 'color': 'green' }
                            }
                        });

                        // Verify update
                        const status = TPDirect.card.getTappayFieldsStatus();
                        console.log("TapPay Setup Done. Status:", status);
                        setSdkReady(true);
                    }, 500); // Increased delay
                } catch (e) {
                    console.error("TapPay Init Error", e);
                    // Even if error (double init), we treat as ready
                    setSdkReady(true);
                }
            } else {
                console.warn("TapPay SDK not found yet.");
                if (setupRetries < maxRetries) {
                    setupRetries++;
                    setTimeout(initTapPay, 500);
                } else {
                    setError("無法載入支付系統，請檢查網路連線 (TapPay SDK Missing)");
                }
            }
        };

        // Start Init
        setSdkReady(false);
        setError("");
        initTapPay();

    }, [isOpen]);

    const handlePrime = (prime: string, method: string) => {
        setLoading(true);
        // Call Backend
        fetch(`${API_URL}/payment/pay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                prime,
                paymentMethod: method,
                details: {
                    amount: amount,
                    currency: "TWD",
                    details: itemName
                },
                ...extraPayload // Merge extra payload (e.g. purchaseType)
            })
        })
            .then(async (res) => {
                const data = await res.json();
                if (res.ok) {
                    onPaymentSuccess(data);
                    onClose();
                } else {
                    setError(data.error || "Payment Failed");
                }
            })
            .catch(() => setError("Network Error"))
            .finally(() => setLoading(false));
    };

    const onSubmitCC = () => {
        setError("");
        const tappayStatus = TPDirect.card.getTappayFieldsStatus();

        if (tappayStatus.canGetPrime === false) {
            setError("請確認信用卡資訊是否正確");
            return;
        }

        TPDirect.card.getPrime((result: any) => {
            if (result.status !== 0) {
                setError('取得 Prime 失敗: ' + result.msg);
                return;
            }
            handlePrime(result.card.prime, 'credit_card');
        });
    };

    const onLinePay = () => {
        TPDirect.linePay.getPrime((result: any) => {
            if (result.status !== 0) {
                setError('取得 Prime 失敗: ' + result.msg);
                return;
            }
            handlePrime(result.prime, 'line_pay');
        });
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px] bg-white">
                <DialogHeader>
                    <DialogTitle>付款確認</DialogTitle>
                    <DialogDescription>
                        項目: {itemName} - NT$ {amount}
                    </DialogDescription>
                </DialogHeader>

                {/* Loading overlay - shown on top of content while initializing */}
                {!sdkReady && !error && (
                    <div className="py-12 text-center text-gray-500">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
                        <p>正在連線至支付系統...</p>
                    </div>
                )}

                {/* Payment content - always rendered, hidden via opacity during loading to allow TapPay to find DOM elements */}
                <div style={!sdkReady && !error ? { opacity: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' } : {}}>
                    <Tabs defaultValue="credit_card" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="credit_card">信用卡</TabsTrigger>
                            <TabsTrigger value="line_pay">LINE Pay</TabsTrigger>
                        </TabsList>

                        <TabsContent value="credit_card" className="space-y-4 pt-4">
                            <div className="space-y-4 border p-4 rounded-md">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">卡號</label>
                                    <div id="card-number" className="h-10 border rounded px-3 py-2"></div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">有效期限</label>
                                        <div id="card-expiration-date" className="h-10 border rounded px-3 py-2"></div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">CCV</label>
                                        <div id="card-ccv" className="h-10 border rounded px-3 py-2"></div>
                                    </div>
                                </div>
                            </div>

                            <Button onClick={onSubmitCC} disabled={loading} className="w-full">
                                {loading ? "處理中..." : `確認支付 NT$ ${amount}`}
                            </Button>
                        </TabsContent>

                        <TabsContent value="line_pay" className="pt-4 text-center">
                            <p className="text-sm text-gray-500 mb-4">使用 LINE Pay 快速結帳 (Sandbox)</p>
                            <Button
                                className="w-full bg-[#00C300] hover:bg-[#00B900] text-white"
                                onClick={onLinePay}
                                disabled={loading}
                            >
                                <Smartphone className="w-4 h-4 mr-2" />
                                使用 LINE Pay 付款
                            </Button>
                        </TabsContent>
                    </Tabs>

                    {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}

                    <div className="mt-4 bg-blue-50 p-3 rounded text-sm text-blue-800 border border-blue-100">
                        <p className="font-bold flex items-center gap-2">
                            <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded">TEST</span>
                            Sandbox Credit Card
                        </p>
                        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
                            <p>Card: 4311-9522-2222-2222</p>
                            <p>CCV: 123</p>
                            <p>Date: MM/YY (Future)</p>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
