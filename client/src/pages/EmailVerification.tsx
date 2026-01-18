import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_URL } from "../config";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "../components/ui/Card";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function EmailVerification() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");
    const navigate = useNavigate();
    const { login } = useAuth();

    const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
    const [message, setMessage] = useState("Verifying your email...");

    useEffect(() => {
        if (!token) {
            setStatus("error");
            setMessage("Invalid verification link.");
            return;
        }

        const verify = async () => {
            try {
                const res = await fetch(`${API_URL}/auth/verify-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });

                const data = await res.json();

                if (res.ok) {
                    setStatus("success");
                    setMessage("Email verified successfully!");
                    // Auto login
                    if (data.token && data.user) {
                        login(data.token, data.user);
                        setTimeout(() => {
                            navigate("/dashboard");
                        }, 2000);
                    }
                } else {
                    setStatus("error");
                    setMessage(data.error || "Verification failed.");
                }
            } catch (error) {
                console.error(error);
                setStatus("error");
                setMessage("An internal error occurred.");
            }
        };

        verify();
    }, [token, login, navigate]);

    return (
        <div className="flex items-center justify-center min-h-[60vh] p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <CardTitle className="text-2xl">Email Verification</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4 py-8">
                    {status === "verifying" && (
                        <>
                            <Loader2 className="w-12 h-12 text-muji-primary animate-spin" />
                            <p className="text-lg text-muji-secondary">{message}</p>
                        </>
                    )}
                    {status === "success" && (
                        <>
                            <CheckCircle className="w-16 h-16 text-green-500" />
                            <p className="text-lg font-medium">{message}</p>
                            <p className="text-sm text-gray-400">Redirecting to dashboard...</p>
                        </>
                    )}
                    {status === "error" && (
                        <>
                            <XCircle className="w-16 h-16 text-red-500" />
                            <p className="text-lg font-medium text-red-500">{message}</p>
                        </>
                    )}
                </CardContent>
                <CardFooter className="justify-center">
                    {status === "error" && (
                        <Button onClick={() => navigate("/login")}>
                            Back to Login
                        </Button>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}
