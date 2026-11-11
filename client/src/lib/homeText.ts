import { getDisplayLocale } from '../utils/localization';

const english = {
  welcome: 'Welcome Back.', question: 'Every wish is matched against all items for you.',
  matches: 'Items matching your wishes', best: 'On-site listings and public references are matched automatically, by wish name and budget.',
  refresh: 'Match again', reading: 'Matching your wishes…',
  failed: 'Your wishes could not be matched just now. Check your connection and sign-in, then match again. This does not mean there are no items.',
  viewAll: 'View all {count}', collapse: 'Collapse results', more: 'See all wish picks in Explore',
  budgetReason: 'Matches the wish and its budget', nameReason: 'Matches the wish name',
  onSite: 'On-site listing', reference: 'Public reference', detail: 'Item details', close: 'Close',
  budget: 'Budget {price}', unmatched: 'No matching items yet for: {names}',
  firstWish: 'Save your first wish', eligible: 'Only your unfinished, visible wishes participate in matching.',
  wishes: 'My wishes', goWishes: 'Open wishlists', sell: 'Photograph and list an item',
  notice: 'Your own listings are excluded from buyer recommendations. Images are not directly compared; check the model and authenticity.',
  shortcuts: 'Quick actions', optional: 'Optional', addPhoto: 'Photograph a wish', burst: 'Batch photo listing',
  search: 'Search items', searchPlaceholder: 'Search items', searchButton: 'Search',
  holiday: 'Upcoming holiday', birthdays: 'Upcoming friend birthdays',
  birthdayLoading: 'Reading friend birthdays…', birthdayFailed: 'Friend birthdays could not be loaded or verified. This does not mean there are no birthdays.',
  birthdayRetry: 'Retry friend birthdays', birthdayEmpty: 'No upcoming birthdays.',
  birthdayDate: 'Birthday: {date}', anonymous: 'Display name not set',
  profile: 'View the public profile of {name}', gifts: 'View the public wishes of {name}',
  integration: 'AI integration · Public API',
  integrationDescription: 'Let a trusted AI tool help manage your wishlist. Personal instructions contain your API key.',
  api: 'View API details →',
};
type Key = keyof typeof english;
const chinese: Record<Key, string> = {
  welcome: '歡迎回來。', question: '每個願望都已幫你比對所有商品。', matches: '願望吻合的商品',
  best: '站內刊登與公開來源都會自動比對，依願望名稱與預算排序。',
  refresh: '重新比對', reading: '正在比對你的願望…',
  failed: '目前無法比對願望，請確認網路及登入狀態後重新比對；這不代表沒有商品。',
  viewAll: '查看全部 {count} 件', collapse: '收合結果', more: '在探索看全部願望推薦',
  budgetReason: '符合願望與預算', nameReason: '符合願望名稱',
  onSite: '站內刊登', reference: '公開來源', detail: '商品詳情', close: '關閉',
  budget: '預算 {price}', unmatched: '這些願望目前沒有吻合的商品：{names}',
  firstWish: '先留下你的第一個願望', eligible: '只有未完成、未隱藏的本人願望會參與配對。', wishes: '我的願望', goWishes: '前往願望清單', sell: '拍照刊登好物',
  notice: '自己的刊登不列入買家推薦；圖片不直接比對，請核對型號與真偽。', shortcuts: '快捷功能', optional: '選用',
  addPhoto: '拍照新增願望', burst: '連拍刊登', search: '搜尋商品', searchPlaceholder: '搜尋商品', searchButton: '搜尋',
  holiday: '即將到來的節日', birthdays: '即將到來的好友生日', birthdayLoading: '正在讀取好友生日…',
  birthdayFailed: '好友生日無法載入或核對，不代表沒有生日提醒。', birthdayRetry: '重試好友生日', birthdayEmpty: '近期沒有好友生日。',
  birthdayDate: '生日：{date}', anonymous: '未設定顯示名稱', profile: '查看{name}的公開資料', gifts: '查看{name}的公開願望',
  integration: 'AI 整合 · 公開 API', integrationDescription: '讓信任的 AI 工具協助管理願望清單。個人指令含您的 API 金鑰。', api: '查看 API 介紹 →',
};
export function homeText(key: Key, values: Record<string, string | number> = {}) {
  const text = (getDisplayLocale().startsWith('zh') ? chinese : english)[key];
  return text.replace(/\{([a-zA-Z]+)\}/g, (match, field: string) => values[field] === undefined ? match : String(values[field]));
}
export function homeDate(value: string | Date) {
  const day = typeof value === 'string' ? new Date(value) : new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  try { return new Intl.DateTimeFormat(getDisplayLocale(), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(day); }
  catch { return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(day); }
}
