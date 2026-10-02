import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { getDisplayLocale } from '../utils/localization';
import { integrationApiBase } from '../lib/aiIntegrationWeb';

type ApiItem = { method:string; path:string; desc:string; body?:string; auth?:boolean };
export default function ApiDocsPage() {
    const zh=getDisplayLocale().startsWith('zh'),text=(chinese:string,english:string)=>zh?chinese:english;
    let base='';try{base=integrationApiBase();}catch{ /* Invalid configuration is not exposed. */ }
    const apiSections:{title:string;apis:ApiItem[]}[]=[
      { title:text('🔐 認證','🔐 Authentication'),apis:[
        {method:'POST',path:'/auth/register',desc:text('註冊帳號；電子信箱必填，登入前須完成郵件驗證。','Register. Email is required; verify it before subsequent login.'),body:'{ phoneNumber, password, email, name?, birthday? }'},
        {method:'POST',path:'/auth/login',desc:text('使用手機或電子信箱登入，取得 JWT。','Log in with phone or email in phoneNumber to obtain a JWT.'),body:'{ phoneNumber, password }'},
        {method:'POST',path:'/auth/forgot-password',desc:text('請求郵件重設連結；回覆不證明收件匣送達。','Request an email reset link. A reply does not prove inbox delivery.'),body:'{ email }'},
        {method:'POST',path:'/auth/reset-password',desc:text('使用郵件連結的一次性 token 重設密碼。','Reset the password using the one-time token from the email link.'),body:'{ token, newPassword }'},
        {method:'POST',path:'/auth/verify-email',desc:text('使用郵件 token 驗證電子信箱。','Verify email with the emailed token.'),body:'{ token }'},
        {method:'POST',path:'/auth/resend-verification',desc:text('重新請求驗證郵件。','Request another verification email.'),body:'{ email }'},
        {method:'POST',path:'/auth/verify-otp',desc:text('保留的舊 OTP 驗證入口；不會寄出密碼重設郵件。','Retained legacy OTP verification. It does not send a password reset email.'),body:'{ phoneNumber, otp }'},
      ]},
      {title:text('📋 願望清單','📋 Wishlists'),apis:[
        {method:'GET',path:'/wishlists',desc:text('讀取我的清單。','Read my wishlists.'),auth:true},
        {method:'POST',path:'/wishlists',desc:text('建立清單。','Create a wishlist.'),body:'{ title, description?, isPublic? }',auth:true},
        {method:'GET',path:'/wishlists/:id',desc:text('依擁有者與公開權限讀取清單。','Read a wishlist subject to ownership and visibility.'),auth:true},
        {method:'PUT',path:'/wishlists/:id',desc:text('更新自己的清單。','Update an owned wishlist.'),body:'{ title?, description?, isPublic? }',auth:true},
        {method:'DELETE',path:'/wishlists/:id',desc:text('刪除自己的清單。','Delete an owned wishlist.'),auth:true},
      ]},
      {title:text('🎁 項目','🎁 Items'),apis:[
        {method:'POST',path:'/wishlists/:id/items',desc:text('新增項目；照片選填。','Add an item with an optional photo.'),body:'multipart/form-data: name, price?, notes?, image?',auth:true},
        {method:'POST',path:'/wishlists/:id/items/url',desc:text('從商品網址擷取資料。','Fetch details from a product URL.'),body:'{ url }',auth:true},
        {method:'GET',path:'/items/:id',desc:text('依擁有者及目前公開權限讀取項目。','Read an item subject to ownership and current visibility.'),auth:true},
        {method:'PUT',path:'/items/:id',desc:text('更新項目；欄位依擁有者或認領權限檢查。','Update an item. Fields are checked against owner or claim permissions.'),body:'{ name?, price?, notes?, isPurchased? }',auth:true},
        {method:'DELETE',path:'/items/:id',desc:text('刪除自己的項目。','Delete an owned item.'),auth:true},
      ]},
      {title:text('👥 社交','👥 Social'),apis:[
        {method:'GET',path:'/users/search?q=:keyword',desc:text('搜尋用戶；只提供允許公開的資料。','Search users with permitted public fields only.'),auth:true},
        {method:'GET',path:'/users/following',desc:text('讀取我的追蹤名單。','Read my following list.'),auth:true},
        {method:'POST',path:'/users/:id/follow',desc:text('追蹤用戶。','Follow a user.'),auth:true},
        {method:'DELETE',path:'/users/:id/follow',desc:text('取消追蹤。','Unfollow a user.'),auth:true},
        {method:'GET',path:'/users/:id/wishlists',desc:text('讀取目前公開的清單。','Read currently public wishlists.'),auth:true},
        {method:'GET',path:'/users/:id/delivery-info',desc:text('須互相追蹤，且各寄送欄位允許公開。','Requires mutual following and visibility permission for each delivery field.'),auth:true},
        {method:'GET',path:'/users/upcoming-birthdays',desc:text('讀取允許公開的即將到來生日。','Read upcoming birthdays allowed by visibility settings.'),auth:true},
      ]},
      {title:text('👤 帳號與 AI 整合','👤 Account and AI integration'),apis:[
        {method:'GET',path:'/users/me',desc:text('讀取我的資料；不包含金鑰或密碼。','Read my profile without keys or passwords.'),auth:true},
        {method:'PUT',path:'/users/me',desc:text('更新資料；電子信箱只能在未設定時填入。','Update profile fields. Email can only be added when unset.'),body:'{ name?, nicknames?, realName?, birthday?, address?, email?, isAvatarVisible?, isRealNameVisible?, isBirthdayVisible?, isAddressVisible?, isPhoneVisible?, isEmailVisible? }',auth:true},
        {method:'POST',path:'/users/me/apikey',desc:text('明確重新產生金鑰；原金鑰立即失效。','Explicitly rotate the key. The previous key becomes invalid.'),auth:true},
        {method:'GET',path:'/users/me/apikey',desc:text('讀取目前金鑰，未建立時回傳 null。','Read the current key, or null when absent.'),auth:true},
        {method:'POST',path:'/users/me/ai-prompt',desc:text('取得含目前金鑰的指令；僅在無金鑰時建立。回傳 prompt、apiKey、userName。','Get instructions with the current key; create only if absent. Returns prompt, apiKey and userName.'),auth:true},
        {method:'GET',path:'/users/me/ai-prompt',desc:text('只讀目前指令；沒有金鑰時回傳 { available: false }。不是原請求回執。','Read current instructions only; returns { available: false } when no key exists. Not an original request receipt.'),auth:true},
        {method:'GET',path:'/users/me/transaction-history',desc:text('讀取帳號原幣別金額與交易狀態。','Read account transactions with original amounts, currencies and statuses.'),auth:true},
        {method:'GET',path:'/users/me/purchases',desc:text('讀取目前認領項目；不是付款或配送證明。','Read currently claimed items. Not proof of payment or delivery.'),auth:true},
      ]},
      {title:text('🤖 AI 功能','🤖 AI features'),apis:[
        {method:'POST',path:'/ai/analyze-image',desc:text('分析圖片，檔案上限 5 MB；仍需可用服務及額度。','Analyze an image up to 5 MB. Service availability and quota still apply.'),body:'multipart/form-data: image',auth:true},
        {method:'POST',path:'/ai/validate-image',desc:text('檢查圖片網址。','Check an image URL.'),body:'{ url }',auth:true},
      ]},
    ];
    const methodColors:Record<string,string>={GET:'bg-green-100 text-green-800',POST:'bg-blue-100 text-blue-800',PUT:'bg-yellow-100 text-yellow-800',DELETE:'bg-red-100 text-red-800'};
    return <div className="max-w-4xl mx-auto p-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6"><h1 className="text-2xl font-bold">{text('API 文件','API docs')}</h1><Link to="/settings" className="inline-flex min-h-11 items-center rounded-md border border-muji-border px-4 py-2 text-sm">{text('← 返回設定','← Back to Settings')}</Link></div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 space-y-2">
        <h2 className="font-medium text-blue-800">{text('🔑 認證方式','🔑 Authentication')}</h2>
        <p className="text-sm text-blue-700">{text('下列標示「需認證」的端點接受有效 JWT 或個人 API 金鑰，仍需符合擁有者、公開與互相追蹤等權限。認證區的入口不要求登入。','The authenticated endpoints listed below accept a valid JWT or personal API key. Ownership, visibility and mutual-follow permissions still apply. Authentication section endpoints do not require login.')}</p>
        <code className="block break-all bg-white p-2 rounded text-sm">Authorization: Bearer &lt;JWT_TOKEN&gt;</code><code className="block break-all bg-white p-2 rounded text-sm">x-api-key: &lt;API_KEY&gt;</code>
        <p className="text-sm text-blue-700">{text('設定的 AI 指令含個人金鑰，只交給信任的工具。變更密碼、撤銷工作階段及刪除帳號另需目前密碼；系統郵件診斷限後台指定管理者的 JWT。','AI instructions in Settings contain your personal key. Share only with a trusted tool. Password changes, session revocation and account deletion also require the current password. Email diagnostics require a JWT for a server-admitted administrator.')}</p>
      </div>
      <div className="bg-gray-50 border rounded-lg p-4 mb-6 space-y-2"><h2 className="font-medium">Base URL</h2><code className="block break-all bg-white p-2 rounded text-sm select-all">{base||text('API 網址目前無法使用。','The API URL is currently unavailable.')}</code><p className="text-xs text-gray-600">{text('將下方相對路徑接到此網址，例如 Base URL + /auth/login；不要再次加上 /api。','Append the relative paths below, for example Base URL + /auth/login. Do not add /api again.')}</p></div>
      <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm" role="note">{text('站內付款與自動配送未開通。付款及訂閱購買入口目前回覆 503 PAYMENT_VERIFICATION_REQUIRED；商品認領不代表已付款。','Platform payment and automatic delivery are unavailable. Payment and subscription purchase endpoints currently return 503 PAYMENT_VERIFICATION_REQUIRED. Claiming an item does not mean it was paid for.')}</p>
      <div className="space-y-6">{apiSections.map(section=><Card key={section.title}><CardHeader className="pb-2"><CardTitle className="text-lg">{section.title}</CardTitle></CardHeader><CardContent><div className="space-y-3">{section.apis.map(api=><div key={api.method+api.path} className="border rounded-lg p-3 bg-gray-50"><div className="flex items-start gap-2 flex-wrap"><span className={`px-2 py-1 rounded text-xs font-mono font-bold ${methodColors[api.method]}`}>{api.method}</span><code className="min-w-0 break-all text-sm font-mono flex-1">{api.path}</code>{api.auth&&<span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">{text('🔒 需認證','🔒 Authentication required')}</span>}</div><p className="text-sm text-gray-600 mt-2">{api.desc}</p>{api.body&&<p className="break-words text-xs text-gray-600 mt-1">Body: <code className="bg-gray-200 px-1 rounded">{api.body}</code></p>}</div>)}</div></CardContent></Card>)}</div>
    </div>;
}
