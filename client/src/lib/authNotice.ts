import { getDisplayLocale } from '../utils/localization';

const notices = {
  restoreFailed: ['無法恢復瀏覽器登入資料，請重新登入。待確認操作仍保留於原帳號。', 'Browser sign-in data could not be restored. Sign in again; pending operations remain with the original account.'],
  logoutIncomplete: ['此頁已登出，但部分舊登入資料未能清除。請清除網站登入資料後再重新登入。', 'This page is signed out, but some older sign-in data could not be removed. Clear the website sign-in data before signing in again.'],
  logoutUnverified: ['此頁已登出，但無法確認瀏覽器登入資料已清除。請清除網站登入資料後再重新登入。', 'This page is signed out, but removal of browser sign-in data could not be verified. Clear the website sign-in data before signing in again.'],
  expired: ['登入已失效，請重新登入後繼續；原待確認操作沒有被刪除。', 'Your session has expired. Sign in again to continue; the original pending operations have been kept.'],
  loginSaveFailed: ['無法安全保存登入資料，請檢查瀏覽器網站儲存設定後重試。', 'Sign-in data could not be saved safely. Check browser website storage settings and try again.'],
  loginCleanupFailed: ['已登入，但部分舊登入資料未能清除；目前使用新帳號的獨立登入紀錄。', 'You are signed in using the new account’s separate session, but some older sign-in data could not be removed.'],
  profileSaveFailed: ['已取得最新帳號資料，但無法完整保存至瀏覽器；重新開啟後請再次核對。', 'The latest account data was received but could not be fully saved in this browser. Recheck it after reopening.'],
  readUnverified: ['暫時無法更新帳號資料；目前顯示上次確認內容，尚未確認登入失效。可重試更新。', 'Account data could not be updated. The last verified data is shown; session expiry has not been confirmed. You can recheck it.'],
  limited: ['帳號讀取暫時受限，請稍後再核對；目前顯示上次確認內容。等待不會自動重送操作。', 'Account requests are temporarily limited. Wait before rechecking; the last verified data is shown. Waiting will not replay operations.'],
  otherAccount: ['其他分頁已變更登入帳號，已切換並重新核對。', 'Another tab changed the signed-in account. This page switched accounts and is rechecking it.'],
  otherLogout: ['其他分頁已登出；原待確認操作仍保留。', 'Another tab signed out. The original pending operations have been kept.'],
  otherInvalid: ['其他分頁的登入資料無法驗證，請重新登入。', 'Sign-in data from another tab could not be verified. Sign in again.'],
  recheck: ['重新核對帳號', 'Recheck account'],
} as const;

export type AuthNotice = Exclude<keyof typeof notices, 'recheck' | 'loginSaveFailed'> | '';
export function authNotice(key: keyof typeof notices): string {
  return notices[key][getDisplayLocale().startsWith('zh') ? 0 : 1];
}
