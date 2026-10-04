import { getDisplayLocale } from '../utils/localization';

const english = {
  welcome: 'Welcome Back.', question: 'What are you looking for today?',
  matches: 'Items matching your wishes', best: 'Start with the best match for each wish.',
  refresh: 'Refresh wishes and matches', reading: 'Reading wishes…',
  progress: 'Matched {finished}/{total} wishes',
  partial: '{count} wishes could not be matched. These results are incomplete. Refresh to retry; this does not mean there are no items.',
  failed: 'Wishes or matches could not be loaded. Check your connection and sign-in, then retry.',
  score: 'Match score {score}', photo: 'View the item photo for {name}',
  expandLabel: '{name} has {count} matching items, {action}', count: '{count} matches',
  collapse: 'Collapse results', expand: 'View all', wish: 'Wish: {name}',
  noMatches: 'No matching items from other sellers right now. Select a wish below to explore the map.',
  firstWish: 'Save your first wish', eligible: 'Only your unfinished, visible wishes participate in matching.',
  wishes: 'My wishes', goWishes: 'Open wishlists', sell: 'Photograph and list an item',
  notice: 'Your own listings are excluded from buyer recommendations. Images are not directly compared; check the model and authenticity.',
  shortcuts: 'Quick actions', optional: 'Optional', addPhoto: 'Photograph a wish', burst: 'Batch photo listing',
  search: 'Search items', searchPlaceholder: 'Search items or wishes', map: 'View on map',
  mapFailed: 'Map preview is unavailable. Open an item above or use the Explore item list.',
  mapLoading: 'Loading the item map…', mapPreview: 'Map preview of matching items',
  mapPosition: 'Locations are approximate. Open wish comparison below for map details.',
  emptyMapPreview: 'Map overview without matching item markers',
  emptyMapNotice: 'Map overview only: there are no matching item markers. Open Explore to search for other items.',
  choose: 'Choose a wish to compare', chooseLabel: 'Choose the wish to compare',
  compareLabel: 'Compare {name} on the map', compare: 'Compare this wish on the map',
  browse: 'Browse the item map without a wish filter',
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
  welcome: '歡迎回來。', question: '今天想找什麼？', matches: '願望吻合的商品', best: '每個願望，先看最匹配的一件。',
  refresh: '重新整理願望與配對', reading: '正在讀取願望…', progress: '已比對 {finished}／{total} 個願望',
  partial: '{count} 個願望配對失敗，以下結果不完整。請重新整理，這不代表沒有商品。',
  failed: '無法載入願望或配對，請確認網路及登入狀態後重試。', score: '吻合 {score} 分', photo: '查看{name}的商品照片',
  expandLabel: '{name}共有{count}件吻合商品，{action}', count: '{count} 件吻合', collapse: '收合結果', expand: '查看全部', wish: '願望：{name}',
  noMatches: '目前沒有其他賣家的吻合商品。仍可在下方選擇願望並前往地圖探索。', firstWish: '先留下你的第一個願望',
  eligible: '只有未完成、未隱藏的本人願望會參與配對。', wishes: '我的願望', goWishes: '前往願望清單', sell: '拍照刊登好物',
  notice: '自己的刊登不列入買家推薦；圖片不直接比對，請核對型號與真偽。', shortcuts: '快捷功能', optional: '選用',
  addPhoto: '拍照新增願望', burst: '連拍刊登', search: '搜尋商品', searchPlaceholder: '搜尋商品或願望', map: '在地圖查看',
  mapFailed: '地圖預覽暫時無法使用，仍可點擊上方商品卡片，或前往探索的商品列表。', mapLoading: '正在載入商品地圖…',
  mapPreview: '願望吻合商品地圖預覽', choose: '選願望交叉比對', chooseLabel: '選擇要交叉比對的願望',
  mapPosition: '位置為約略範圍；完整說明可展開下方願望交叉比對。',
  emptyMapPreview: '沒有吻合商品標記的地圖概覽',
  emptyMapNotice: '目前僅顯示地圖概覽，沒有吻合商品標記；可前往探索搜尋其他商品。',
  compareLabel: '在地圖交叉比對{name}', compare: '在地圖交叉比對這個願望', browse: '不套用願望，瀏覽商品地圖',
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
