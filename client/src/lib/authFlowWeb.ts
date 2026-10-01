import { getUserLocale } from '../utils/localization';
import { parseAuthUser } from './authSession';

const copy = {
  zh: {
    displayName: '顯示名稱', recoveryNavigation: '帳號與恢復入口',
    passwordHint: '密碼 8–72 字元，包含英文字母與數字；符號限 @$!%*?&。',
    confirmation: '再次輸入新密碼', show: '顯示密碼', hide: '隱藏密碼',
    mismatch: '兩次新密碼不一致。', weak: '請使用 8–72 字元、包含英文字母與數字的新密碼；符號限 @$!%*?&。',
    email: 'Email', invalidEmail: '請輸入有效的 Email。', invalidName: '顯示名稱需為 1–50 個字元。',
    invalidPhone: '請輸入 09 開頭的十位台灣手機號碼。', invalidBirthday: '請選擇有效且不晚於今天的生日。',
    invalidCredentials: '帳號或密碼不正確。', missing: '請檢查必填欄位。',
    exists: '此手機或 Email 已註冊，請登入或使用忘記密碼。', unverified: '請先驗證 Email；可以重新寄送驗證信。',
    expired: '連結已失效或使用過，請申請新的驗證／重設信。', rate: '操作過於頻繁，請稍後重試。',
    unknown: '暫時無法確認結果；不會自動重送。請先登入核對，或申請新的驗證／重設信。',
    invalidResponse: '服務回應不完整，尚未確認成功；不會自動重送。請先登入核對，或申請新的信件。',
    invalidLink: '請貼上本服務的正確連結，或 64 位驗證碼。',
    verifyTitle: '驗證 Email', resetTitle: '重設密碼', verifyInput: 'Email 驗證連結或驗證碼', resetInput: '密碼重設連結或驗證碼',
    linkNote: '連結已載入時仍須確認後提交；不會自動操作或切換登入帳號。連結與密碼不會保存為本機草稿。',
    verifySuccess: 'Email 已驗證。請以帳號與密碼登入；不會使用驗證信切換目前帳號。',
    resetSuccess: '密碼已重設，該帳號的舊裝置登入與個人 API key 已撤銷。請使用新密碼登入。',
    processing: '確認中…', login: '返回登入', resend: '重新寄送驗證信', forgot: '申請密碼重設信',
    haveVerify: '我已有 Email 驗證連結', haveReset: '我已有密碼重設連結',
    emailRequest: '輸入註冊時的 Email。系統不會透露帳號是否存在。', send: '提交寄信請求',
    requestAccepted: '已收到請求；若帳號符合條件，系統會嘗試寄送信件。請查看信箱及垃圾郵件；未收到可稍後重新申請。',
    requestAgain: '重新申請寄信', verifyRegistration: '請驗證 Email',
    registrationSent: '帳號已建立，系統已接受驗證信寄送。請查看下方 Email 的收件匣及垃圾郵件。',
    registrationNotSent: '帳號已建立，但驗證信未成功寄送。請重新申請驗證信，不要重複註冊。',
    registrationUnknown: '註冊結果尚未確認。請先嘗試登入或申請驗證信；不要直接重複建立帳號。',
    optionalBirthday: '生日（選填）', terms: '使用條款', privacy: '隱私權政策',
    securityPassword: '密碼已更新，舊裝置登入與個人 API key 已撤銷，請重新登入。',
    securitySessions: '所有裝置登入已撤銷，個人 API key 保持不變，請重新登入。',
    securityUnknown: '登入已失效，請重新登入；本次帳號操作結果尚未確認。',
  },
  en: {
    displayName: 'Display name', recoveryNavigation: 'Account and recovery links',
    passwordHint: 'Use 8–72 characters with letters and numbers; allowed symbols: @$!%*?&.',
    confirmation: 'Confirm new password', show: 'Show password', hide: 'Hide password',
    mismatch: 'The new passwords do not match.', weak: 'Use 8–72 characters with letters and numbers; allowed symbols: @$!%*?&.',
    email: 'Email', invalidEmail: 'Enter a valid email address.', invalidName: 'Use a display name of 1–50 characters.',
    invalidPhone: 'Enter a ten-digit Taiwan mobile number beginning with 09.', invalidBirthday: 'Choose a valid birthday no later than today.',
    invalidCredentials: 'The account or password is incorrect.', missing: 'Check the required fields.',
    exists: 'This phone number or email is already registered. Sign in or request a password reset.', unverified: 'Verify your email first. You can request another verification email.',
    expired: 'This link is expired, invalid or already used. Request a new verification or reset email.', rate: 'Too many requests. Try again later.',
    unknown: 'The result is unconfirmed. Nothing will be resent automatically. Sign in to check, or request a new verification or reset email.',
    invalidResponse: 'The response is incomplete, so success is unconfirmed. Nothing will be resent automatically. Sign in to check or request a new email.',
    invalidLink: 'Paste a correct link from this service or a 64-character verification code.',
    verifyTitle: 'Verify email', resetTitle: 'Reset Password', verifyInput: 'Email verification link or code', resetInput: 'Password reset link or code',
    linkNote: 'Confirm before submitting, even when a link is already loaded. This will not automatically act or switch your signed-in account. Links and passwords are not saved as local drafts.',
    verifySuccess: 'Email verified. Sign in with your account and password. This verification link will not switch your current account.',
    resetSuccess: 'Password reset confirmed. Old device sessions and the personal API key for this account were revoked. Sign in with the new password.',
    processing: 'Confirming…', login: 'Back to Login', resend: 'Request another verification email', forgot: 'Request a password reset email',
    haveVerify: 'I have an email verification link', haveReset: 'I have a password reset link',
    emailRequest: 'Enter the email used for registration. The service will not reveal whether the account exists.', send: 'Submit email request',
    requestAccepted: 'Request received. If the account is eligible, the service will attempt delivery. Check your inbox and spam folder; you can request again later.',
    requestAgain: 'Request email again', verifyRegistration: 'Verify your email',
    registrationSent: 'Account created and verification email delivery accepted. Check the inbox and spam folder for the email below.',
    registrationNotSent: 'Account created, but verification email delivery failed. Request another verification email instead of registering again.',
    registrationUnknown: 'Registration is unconfirmed. Try signing in or requesting verification first instead of creating the account again.',
    optionalBirthday: 'Birthday — optional', terms: 'Terms of Use', privacy: 'Privacy Policy',
    securityPassword: 'Password updated. Old device sessions and the personal API key were revoked. Sign in again.',
    securitySessions: 'All device sessions were revoked. The personal API key is unchanged. Sign in again.',
    securityUnknown: 'Your session has expired. Sign in again; the account operation result is unconfirmed.',
  },
};
export function authText(key: keyof typeof copy.zh): string {
  let locale = 'en'; try { locale = getUserLocale(); } catch { /* Storage failure must not block recovery. */ }
  return copy[locale.startsWith('zh') ? 'zh' : 'en'][key];
}
export class AuthFlowError extends Error {
  code: keyof typeof copy.zh;
  uncertain: boolean;
  constructor(code: keyof typeof copy.zh, uncertain = false) { super('Account flow rejected');this.code=code;this.uncertain=uncertain; }
}
export function authIssue(error: unknown) { return authText(error instanceof AuthFlowError ? error.code : 'unknown'); }
export function emailPayload(raw: string) {
  const email = raw.trim();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new AuthFlowError('invalidEmail');
  return { email };
}
export function newPasswordPayload(password: string, confirmation: string) {
  if (password !== confirmation) throw new AuthFlowError('mismatch');
  if (password.length > 72 || !/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/.test(password)) throw new AuthFlowError('weak');
  return password;
}
export function registrationPayload(fields: {name:string;phoneNumber:string;email:string;password:string;confirmation:string;birthday:string}) {
  const name = fields.name.trim(), phoneNumber = fields.phoneNumber.trim();
  if (!name || name.length > 50) throw new AuthFlowError('invalidName');
  if (!/^09\d{8}$/.test(phoneNumber)) throw new AuthFlowError('invalidPhone');
  const { email } = emailPayload(fields.email), password = newPasswordPayload(fields.password,fields.confirmation);
  const birthday = fields.birthday;
  if (birthday && (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || !Number.isFinite(Date.parse(birthday)) ||
    new Date(birthday).toISOString().slice(0,10) !== birthday || birthday > today())) throw new AuthFlowError('invalidBirthday');
  return { name,phoneNumber,email,password,...(birthday ? {birthday} : {}) };
}
export function today() { const date=new Date(); return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'); }
export function recoveryToken(raw: string, mode: 'verify'|'reset', origin = window.location.origin) {
  const value=raw.trim();
  if (/^[0-9a-f]{64}$/.test(value)) return value;
  try {
    const link=new URL(value);
    const path=mode==='verify'?'verify-email':'reset-password';
    const web=link.origin===origin&&link.pathname==='/'+path;
    const native=link.protocol==='weesh:'&&!link.port&&link.hostname===path&&(link.pathname===''||link.pathname==='/');
    if (value.length<=2048 && (web||native) && !link.username && !link.password && !link.hash &&
      [...link.searchParams.keys()].length===1 && /^[0-9a-f]{64}$/.test(link.searchParams.get('token')??'')) return link.searchParams.get('token')!;
  } catch { /* Invalid input is never sent. */ }
  throw new AuthFlowError('invalidLink');
}
export function object(value: unknown): Record<string,unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new AuthFlowError('invalidResponse',true);
  return value as Record<string,unknown>;
}
export function emailRequestAck(value:unknown) { const ack=object(value); if(typeof ack.message!=='string'||!ack.message||ack.message.length>1000) throw new AuthFlowError('invalidResponse',true); }
export function registrationAck(value:unknown,email:string) {
  const ack=object(value), verification=object(ack.emailVerification);
  try { parseAuthUser(ack.user); } catch { throw new AuthFlowError('invalidResponse',true); }
  if(verification.required!==true || typeof verification.sent!=='boolean' || verification.sentTo!==email) throw new AuthFlowError('invalidResponse',true);
  return {sent:verification.sent}; // Never admit registration's unverified JWT as a login.
}
export function verificationAck(value:unknown) { const ack=object(value); emailRequestAck(ack); try { parseAuthUser(ack.user); } catch { throw new AuthFlowError('invalidResponse',true); } }
export function resetAck(value:unknown) { const ack=object(value); if(ack.changed!==true||ack.requiresLogin!==true||ack.personalApiKeysRevoked!==true) throw new AuthFlowError('invalidResponse',true); }
export function rejection(status:number,value:unknown) {
  const code=object(value).errorCode;
  const keys:Record<string,keyof typeof copy.zh>={INVALID_CREDENTIALS:'invalidCredentials',MISSING_FIELDS:'missing',USER_EXISTS:'exists',WEAK_PASSWORD:'weak',EMAIL_NOT_VERIFIED:'unverified',INVALID_TOKEN:'expired',TOKEN_EXPIRED:'expired'};
  return new AuthFlowError(status===429?'rate':typeof code==='string'&&keys[code]?keys[code]:'unknown',status>=500);
}
