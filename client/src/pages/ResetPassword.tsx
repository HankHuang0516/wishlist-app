import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_URL } from "../config";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "../components/ui/Card";
import { CheckCircle, XCircle, Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { t } from "../utils/localization";

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");
    const navigate = useNavigate();

    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [status, setStatus] = useState<"form" | "loading" | "success" | "error">("form");
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (!token) {
            setStatus("error");
            setMessage("Invalid reset link.");
        }
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            setMessage("Passwords do not match.");
            return;
        }

        setStatus("loading");

        try {
            const res = await fetch(`${API_URL}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword })
            });

            const data = await res.json();

            if (res.ok) {
                setStatus("success");
                setMessage(data.message || "Password reset successful!");
                setTimeout(() => navigate("/login"), 3000);
            } else {
                setStatus("error");
                setMessage(data.error || "Reset failed.");
            }
        } catch (error) {
            console.error(error);
            setStatus("error");
            setMessage("An internal error occurred.");
        }
    };

    return (
        <div className="flex items-center justify-center min-h-[60vh] p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">{t('forgot.resetPassword')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {status === "loading" && (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <Loader2 className="w-12 h-12 text-muji-primary animate-spin" />
                            <p className="text-lg text-muji-secondary">Resetting password...</p>
                        </div>
                    )}

                    {status === "success" && (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <CheckCircle className="w-16 h-16 text-green-500" />
                            <p className="text-lg font-medium">{message}</p>
                            <p className="text-sm text-gray-400">Redirecting to login...</p>
                        </div>
                    )}

                    {status === "error" && (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <XCircle className="w-16 h-16 text-red-500" />
                            <p className="text-lg font-medium text-red-500">{message}</p>
                            <Button onClick={() => navigate("/forgot-password")}>
                                Try Again
                            </Button>
                        </div>
                    )}

                    {status === "form" && (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {message && (
                                <div className="bg-red-50 text-red-600 p-3 rounded text-sm border border-red-200">
                                    {message}
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">{t('forgot.newPassword')}</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        placeholder={t('forgot.newPassword')}
                                        className="pl-10 pr-10"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required
                                        minLength={8}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-xs text-gray-400">{t('register.passwordHint')}</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">Confirm Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Confirm new password"
                                        className="pl-10"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        minLength={8}
                                    />
                                </div>
                            </div>

                            <Button className="w-full" type="submit">
                                Reset Password
                            </Button>
                        </form>
                    )}
                </CardContent>
                <CardFooter className="justify-center">
                    {status === "form" && (
                        <Button variant="ghost" onClick={() => navigate("/login")}>
                            {t('common.back')}
                        </Button>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}
