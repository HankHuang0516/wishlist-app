import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ListingReportWeb from '../components/ListingReportWeb';
import { reportText as text } from '../lib/listingReportCopy';
export default function ListingReportsPage() {
  const { token, user } = useAuth(), navigate = useNavigate();
  if (!token || !user) return <section className="space-y-4"><h1 className="text-2xl font-semibold">{text('我的商品檢舉')}</h1><p>{text('登入後查看本人紀錄與恢復待確認操作。')}</p><Link to="/login?next=%2Freports" className="text-green-800 underline">{text('登入')}</Link></section>;
  return <ListingReportWeb key={`${user.id}:${token}`} token={token} userId={user.id} onClose={() => navigate('/settings')} />;
}
