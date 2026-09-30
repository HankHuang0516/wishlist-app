import { Link } from 'react-router-dom';
import AccountSecurityPanel from '../components/AccountSecurityPanel';
export default function ChangePasswordPage() {
  return <div className="max-w-md mx-auto p-4 space-y-6">
    <h1 className="text-2xl font-bold">帳號安全</h1>
    <Link to="/settings" className="inline-block text-blue-700">返回我的／設定</Link>
    <AccountSecurityPanel initiallyOpen />
  </div>;
}
