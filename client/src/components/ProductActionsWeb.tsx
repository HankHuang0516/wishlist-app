import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/marketplaceApi';
import { openProductChat } from '../lib/chatWeb';
import type { PublicListing } from '../lib/listingSearch';
const button = 'inline-flex min-h-11 items-center rounded-xl border px-4 py-2 disabled:opacity-50';
export default function ProductActionsWeb({ listing, onReport }: { listing: PublicListing; onReport: () => void }) {
  const { token, user } = useAuth();
  if (!token || !user) return <div className="space-y-2"><Link className={button} to={'/login?next=' + encodeURIComponent('/listings/' + listing.id)}>登入以聯絡賣家或檢舉商品</Link></div>;
  return <Actions key={`${user.id}:${token}:${listing.id}`} token={token} userId={user.id} listing={listing} onReport={onReport} />;
}
function Actions({ token, userId, listing, onReport }: { token: string; userId: number; listing: PublicListing; onReport: () => void }) {
  const navigate = useNavigate(), active = useRef(true), gate = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function contact() {
    if (gate.current) return;
    if (Date.parse(listing.expiresAt) <= Date.now()) { setError('商品已失效，請重新載入核對。'); return; }
    gate.current = true; setBusy(true); setError('');
    try {
      const room = await openProductChat((path, init) => api<unknown>(token, path, init), listing.id, listing.owner.id, userId);
      if (active.current) navigate('/chat?room=' + room.id);
    } catch { if (active.current) setError('尚未確認聊天室是否已建立。可查看聊天收件匣，或明確重試；同一商品與買賣雙方不會重建另一個聊天室，也沒有發送訊息。'); }
    finally { gate.current = false; if (active.current) setBusy(false); }
  }
  if (listing.owner.id === userId) return <Link className={button} to="/my-listings">管理我的商品</Link>;
  return <div className="space-y-3"><div className="flex flex-wrap gap-3"><button className={`${button} bg-green-800 text-white`} disabled={busy} onClick={() => void contact()}>{busy ? '正在確認聊天室…' : '聯絡賣家／預約面交'}</button><button className={`${button} text-red-800`} disabled={busy} onClick={onReport}>檢舉此商品</button></div>
    {error && <div role="alert" className="space-y-2 rounded-xl bg-red-50 p-3 text-red-800"><p>{error}</p><Link className={button} to="/chat">查看聊天收件匣</Link></div>}
  </div>;
}
