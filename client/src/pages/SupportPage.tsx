import { useState } from 'react';
import { Link } from 'react-router-dom';
import FeedbackModal from '../components/FeedbackModal';
import { supportText as st } from '../lib/supportCopy';

export default function SupportPage() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return <section className="mx-auto max-w-3xl space-y-6 rounded-2xl bg-white p-6 text-muji-primary shadow-sm sm:p-10">
    <div>
      <h1 className="text-3xl font-bold">{st('Wishlist.ai 支援與聯絡')}</h1>
      <p className="mt-2 text-muji-secondary">{st('願望、二手刊登、帳號登入與隱私相關協助。')}</p>
    </div>
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">{st('需要協助？')}</h2>
      <p>{st('請按下方按鈕送出問題與回覆用 Email；不必先登入。請勿提供密碼或完整付款資料。')}</p>
      <button type="button" onClick={() => setFeedbackOpen(true)}
        className="min-h-11 rounded-xl bg-muji-primary px-5 py-3 font-semibold text-white hover:opacity-90">
        {st('開啟意見回饋')}
      </button>
    </div>
    <div className="space-y-3 border-t border-muji-border pt-6">
      <Link className="underline" to="/partners/inquiry">{st('商家合作意向（專用收件表單）')}</Link>
      <h2 className="text-xl font-semibold">{st('常用協助')}</h2>
      <ul className="list-inside list-disc space-y-2 text-muji-secondary">
        <li><Link className="underline" to="/forgot-password">{st('忘記密碼')}</Link></li>
        <li><Link className="underline" to="/account-deletion">{st('刪除帳號與資料')}</Link></li>
        <li><Link className="underline" to="/privacy">{st('隱私權政策')}</Link></li>
      </ul>
    </div>
    <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
  </section>;
}
