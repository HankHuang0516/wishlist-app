import { useState } from 'react';
import { Link } from 'react-router-dom';
import FeedbackModal from '../components/FeedbackModal';

export default function SupportPage() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return <section className="mx-auto max-w-3xl space-y-6 rounded-2xl bg-white p-6 text-muji-primary shadow-sm sm:p-10">
    <div>
      <h1 className="text-3xl font-bold">Wishlist.ai 支援與聯絡</h1>
      <p className="mt-2 text-muji-secondary">Support for wishes, second-hand listings, account access, and privacy.</p>
    </div>
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">需要協助？ / Need help?</h2>
      <p>請按下方按鈕送出問題與回覆用 Email；不必先登入。請勿提供密碼或完整付款資料。</p>
      <p>Use the form below to describe the issue and leave an email for a reply. You can submit it without signing in. Never include your password or full payment details.</p>
      <button type="button" onClick={() => setFeedbackOpen(true)}
        className="min-h-11 rounded-xl bg-muji-primary px-5 py-3 font-semibold text-white hover:opacity-90">
        開啟意見回饋 / Contact support
      </button>
    </div>
    <div className="space-y-3 border-t border-muji-border pt-6">
      <Link className="underline" to="/partners/inquiry">商家合作意向（專用收件表單）</Link>
      <h2 className="text-xl font-semibold">常用協助 / Quick links</h2>
      <ul className="list-inside list-disc space-y-2 text-muji-secondary">
        <li><Link className="underline" to="/forgot-password">忘記密碼 / Reset password</Link></li>
        <li><Link className="underline" to="/account-deletion">刪除帳號與資料 / Delete account and data</Link></li>
        <li><Link className="underline" to="/privacy">隱私權政策 / Privacy policy</Link></li>
      </ul>
    </div>
    <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
  </section>;
}
