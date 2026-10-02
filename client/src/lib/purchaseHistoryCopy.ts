import { getDisplayLocale } from '../utils/localization';
const english = {
 '交易與送禮紀錄':'Transactions and gift claims', '帳號交易紀錄':'Account transactions', '目前未開放新的購買與訂閱；這裡保留既有帳號紀錄。':'New purchases and subscriptions are unavailable. Existing account records remain here.',
 '送禮認領紀錄':'Gift claims', '這是目前仍由你認領的願望，不是付款或送達證明。清單刪除或取消認領後可能不再列出。':'These are wishes currently claimed by you, not proof of payment or delivery. Deleted lists or released claims may no longer appear.',
 '正在讀取紀錄…':'Reading history…', '無法讀取紀錄；不代表沒有紀錄。':'History could not be read. This does not mean it is empty.', '登入或權限已失效，請重新登入後核對。':'Your session or permission is unavailable. Sign in again to check.',
 '重試讀取帳號交易':'Retry account transactions', '重試讀取送禮認領':'Retry gift claims', '沒有帳號交易紀錄':'No account transactions', '目前沒有送禮認領':'No current gift claims', '登入後查看紀錄':'Sign in to view history', '返回設定':'Back to Settings',
 '項目':'Item', '日期':'Date', '金額':'Amount', '狀態':'Status', '尊榮版訂閱':'Premium subscription', '清單容量擴充':'Wishlist capacity', '追蹤人數擴充':'Following capacity', '其他交易':'Other transaction',
 '完成':'Completed', '處理中':'Pending', '失敗':'Failed', '已取消':'Cancelled', '已退款':'Refunded', '其他狀態':'Other status', '願望所屬使用者':'Wishlist owner', '未命名使用者':'Unnamed user', '未命名清單':'Untitled wishlist', '開啟原商品連結':'Open original item link', '連結目前不可開啟':'Link unavailable',
 '此認領願望目前不可閱覽':'This claimed wish is currently unavailable', '對方已隱藏願望或將清單設為私人；紀錄不授予閱覽權限。':'The owner hid the wish or made the list private. A claim does not grant access.', '未提供參考價格':'No reference price',
} as const;
export function historyText(key: keyof typeof english) { return getDisplayLocale().startsWith('zh') ? key : english[key]; }
export function historyLocale() { return getDisplayLocale().startsWith('zh') ? 'zh-TW' : 'en-US'; }
