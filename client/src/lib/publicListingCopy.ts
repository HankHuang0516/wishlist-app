import { getDisplayLocale } from '../utils/localization';

const english = {
  '商品已失效，請重新載入核對。': 'This item has expired. Reload to check its current status.',
  '商品資訊與連結已複製': 'Item details and link copied',
  '無法分享，請稍後重試。': 'The item could not be shared. Try again later.',
  '正在載入商品…': 'Loading item…',
  '暫時無法載入商品': 'The item could not be loaded',
  '請稍後再試。': 'Try again later.',
  '請求暫時受限，請稍後再讀取；不代表商品已停止刊登。': 'Requests are temporarily limited. Try reading again later; this does not mean the item is no longer listed.',
  '重新載入商品': 'Reload item',
  '商品已停止刊登或連結無效': 'The item is no longer listed or the link is invalid',
  '這件商品目前不對外公開；如需確認，請聯絡原刊登者。': 'This item is not currently public. Contact the original seller to confirm.',
  '回首頁': 'Back to home',
  '二手': 'Used',
  '新品': 'New',
  '已保留': 'Reserved',
  '（約略地區）': ' (approximate area)',
  '商品說明': 'Item description',
  '刊登者：': 'Seller: ',
  '用戶': 'User',
  '品牌：': 'Brand: ',
  '未提供': 'Not provided',
  '交付：': 'Delivery: ',
  '面交': 'Meetup',
  '寄送': 'Shipping',
  '可議價': 'Negotiable',
  '不議價': 'Not negotiable',
  '失效時間：': 'Expires: ',
  '（台灣時間）': ' (Taiwan time)',
  '在探索地圖定位此商品': 'Locate this item on the explore map',
  '分享商品': 'Share item',
  '正在分享…': 'Sharing…',
  '登入以聯絡賣家或檢舉商品': 'Sign in to contact the seller or report the item',
  '管理我的商品': 'Manage my item',
  '正在確認聊天室…': 'Checking the conversation…',
  '聯絡賣家／預約面交': 'Contact seller / arrange meetup',
  '檢舉此商品': 'Report this item',
  '查看聊天收件匣': 'View chat inbox',
  '尚未確認聊天室是否已建立。可查看聊天收件匣，或明確重試；同一商品與買賣雙方不會重建另一個聊天室，也沒有發送訊息。': 'The conversation is unconfirmed. Check the inbox or retry explicitly. The same item and participants will not create another conversation; no message was sent.',
} as const;
export type PublicListingCopyKey = keyof typeof english;
const chinese = () => getDisplayLocale().startsWith('zh');
export function publicListingText(key: PublicListingCopyKey): string { return chinese() ? key : english[key]; }
export function publicListingPrice(price: number): string {
  return price === 0 ? chinese() ? '免費贈送' : 'Free' : `NT$ ${new Intl.NumberFormat(chinese() ? 'zh-TW' : 'en-US', { maximumFractionDigits: 2 }).format(price)}`;
}
export function publicListingPhotoLabel(title: string, index: number): string {
  return chinese() ? `${title}商品照片${index}` : `${title} item photo ${index}`;
}
export function publicListingTime(value: string): string {
  return new Date(value).toLocaleString(chinese() ? 'zh-TW' : 'en-US', { timeZone: 'Asia/Taipei' });
}
