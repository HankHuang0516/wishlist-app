import { useState } from "react";
import { Link } from "react-router-dom";
import FeedbackModal from "../components/FeedbackModal";
import { Button } from "../components/ui/Button";
import { getUserLocale } from "../utils/localization";

export default function SupportPage() {
    const [open, setOpen] = useState(false);
    const isZh = getUserLocale().startsWith("zh");

    return (
        <div className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-muji-border bg-white p-6">
            <h1 className="text-2xl font-bold text-muji-primary">{isZh ? "Wishlist.ai 支援" : "Wishlist.ai Support"}</h1>
            <p className="text-muji-secondary">
                {isZh
                    ? "如果遇到帳號、願望、刊登、照片辨識或聊天問題，請透過意見回饋告訴我們。未登入時請留下電子郵件，以便我們回覆。"
                    : "For account, wishlist, listing, photo recognition, or chat issues, send us feedback. If you are not signed in, include your email address so we can reply."}
            </p>
            <Button onClick={() => setOpen(true)}>{isZh ? "聯絡支援／意見回饋" : "Contact support / Send feedback"}</Button>
            <p className="text-sm text-muji-secondary">
                {isZh ? "如需刪除帳號，也可直接前往 " : "To delete your account, you can also visit "}
                <Link to="/account-deletion" className="underline">{isZh ? "刪除帳號頁面" : "the account deletion page"}</Link>{isZh ? "。" : "."}
            </p>
            <FeedbackModal isOpen={open} onClose={() => setOpen(false)} />
        </div>
    );
}
