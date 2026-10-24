import { Link } from 'react-router-dom';
import AccountSecurityPanel from '../components/AccountSecurityPanel';
import { settingsText as st, settingsChinese } from '../lib/settingsCopy';
export default function ChangePasswordPage() {
  return <div className="max-w-md mx-auto p-4 space-y-6">
    <h1 className="text-2xl font-bold">{st('帳號安全')}</h1>
    <Link to="/settings" className="inline-flex min-h-11 items-center text-blue-700">{settingsChinese()?'返回我的／設定':'Back to my settings'}</Link>
    <AccountSecurityPanel initialPage="password" />
  </div>;
}
