import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { API_URL } from '../config';
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/Card";
import { ArrowLeft, KeyRound, Smartphone } from "lucide-react";

export default function ForgotPasswordPage() {
    const navigate = useNavigate();
    const [step, setStep] = useState<"phone" | "reset">("phone");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber })
            });
            const data = await res.json();

            if (res.ok) {
                alert(`驗證碼已發送至 ${phoneNumber} (請查看 Server Console)`);
                setStep("reset");
            } else {
                setError(data.error || "發送失敗");
            }
        } catch (e) {
            setError("連線錯誤");
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber, otp, newPassword })
            });
            const data = await res.json();

            if (res.ok) {
                alert("密碼重設成功！請使用新密碼登入。");
                navigate('/login');
            } else {
                setError(data.error || "重設失敗");
            }
        } catch (e) {
            setError("連線錯誤");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-muji-bg flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-white shadow-xl border-t-4 border-t-muji-primary">
                <CardHeader className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="p-0 h-8 w-8" onClick={() => navigate('/login')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <CardTitle className="text-2xl font-bold text-muji-primary">
                            {step === "phone" ? "忘記密碼" : "重設密碼"}
                        </CardTitle>
                    </div>
                    <CardDescription>
                        {step === "phone"
                            ? "請輸入您的手機號碼以取得驗證碼"
                            : "請輸入驗證碼與新密碼"}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm font-medium border border-red-200">
                            {error}
                        </div>
                    )}

                    {step === "phone" ? (
                        <form onSubmit={handleSendOtp} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">手機號碼</label>
                                <div className="relative">
                                    <Smartphone className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                    <Input
                                        placeholder="0912345678"
                                        className="pl-10"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <Button className="w-full" type="submit" disabled={loading}>
                                {loading ? "發送中..." : "發送驗證碼"}
                            </Button>
                        </form>
                    ) : (
                        <form onSubmit={handleResetPassword} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">手機號碼</label>
                                <Input value={phoneNumber} disabled className="bg-gray-100" />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">驗證碼 (OTP)</label>
                                <div className="relative">
                                    <KeyRound className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                    <Input
                                        placeholder="6位數驗證碼"
                                        className="pl-10"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">新密碼</label>
                                <Input
                                    type="password"
                                    placeholder="請輸入新密碼"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    minLength={6}
                                />
                            </div>

                            <Button className="w-full" type="submit" disabled={loading}>
                                {loading ? "處理中..." : "重設密碼"}
                            </Button>

                            <Button
                                type="button"
                                variant="ghost"
                                className="w-full text-sm text-gray-500"
                                onClick={() => setStep("phone")}
                            >
                                返回上一步
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
