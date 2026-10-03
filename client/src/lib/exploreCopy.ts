import { getDisplayLocale } from '../utils/localization';
import { ApiFailure } from './marketplaceApi';
import { externalPrice, type ExternalListing } from './externalListingSearch';
import type { WishMatch } from './wishData';

const english = {
  "概略位置，非取貨點": "Approximate location, not a pickup point",
  "公共面交點": "Public meeting point",
  "不是商品或賣家所在地。": "Not the item or seller location.",
  "來源商品圖片": "Source item photo",
  "來源商品圖片，顯示縮圖": "Source item photo, showing a thumbnail",
  "來源商品圖片，縮圖已載入": "Source item photo, thumbnail loaded",
  "來源商品圖片無法載入": "Source item photo could not load",
  "來源商品圖片載入中": "Source item photo is loading",
  "照片載入中…": "Loading photo…",
  "照片暫時無法載入，仍可前往來源網站確認商品。": "Photos could not load. You can still verify the item on the source website.",
  "高畫質照片暫時無法載入，目前顯示縮圖": "The high-resolution photo could not load. Showing a thumbnail.",
  "探索商品地圖": "Explore the item map",
  "登入後可搜尋商品與交叉比對自己的願望。": "Sign in to search items and compare them with your wishes.",
  "登入": "Sign in",
  "在附近，找到願望的另一種可能。": "Find another way to fulfil a wish nearby.",
  "拍照刊登好物": "Photograph and list an item",
  "查看{title}商品詳情": "View item details: {title}",
  "查看{title}來源詳情": "View source details: {title}",
  "在地圖查看{title}": "View on the map: {title}",
  "二手": "Used",
  "新品": "New",
  "已保留": "Reserved",
  "在售": "Available",
  " · 我的刊登預覽": " · My listing preview",
  "吻合 {score} 分": "Match score {score}",
  " · 約 {distance} 公里": " · Approximately {distance} km",
  "外部來源 · 非站內賣家 · 行政區中心": "External source · Not an in-app seller · District centre",
  "清除連結條件，重新探索": "Clear link filters and explore again",
  "正在準備搜尋條件…": "Preparing search filters…",
  "商品關鍵字": "Item keywords",
  "商品名稱、品牌或型號": "Item name, brand or model",
  "搜尋": "Search",
  "過濾與願望交叉比對（選用）": "Filters and wish comparison (optional)",
  "品牌（精確匹配）": "Brand (exact match)",
  "商品分類": "Item category",
  "所有分類": "All categories",
  "商品狀態": "Item condition",
  "新品與二手": "New and used",
  "交付方式": "Delivery method",
  "不限": "Any",
  "面交": "Meetup",
  "寄送": "Shipping",
  "最低售價（NT$）": "Minimum price (NT$)",
  "最高售價（NT$）": "Maximum price (NT$)",
  "交叉比對我的願望": "Compare my wish",
  "不套用願望": "No wish filter",
  "目前連結的願望（尚未讀取）": "Linked wish (not yet read)",
  "距離上限（公里，0.5–200，選用）": "Maximum distance (km, 0.5–200, optional)",
  "距離以目前地圖約略中心計算，不是精確定位。外部來源不支援品牌、分類、交付、新品或距離條件時不列入結果。": "Distance uses the approximate map centre, not precise location. External sources are excluded when they cannot verify brand, category, delivery, new-item or distance filters.",
  "套用條件": "Apply filters",
  "清除條件": "Clear filters",
  "正在交叉比對：{name}": "Comparing wish: {name}",
  "所選願望": "Selected wish",
  "含自己刊登的配對預覽，不能向自己購買。依文字、型號、條件與預算比對，圖片不直接比對；分數不保證同一型號或真偽。": "Includes previews of your own listings, which you cannot buy from yourself. Matching uses text, model, preferences and budget, not direct image comparison. A score does not guarantee the same model or authenticity.",
  "地圖": "Map",
  "商品列表": "Item list",
  "移至我的位置": "Move to my location",
  "搜尋此範圍": "Search this area",
  "擴大搜尋範圍": "Expand search area",
  "返回目前結果": "Return to current results",
  "正在讀取目前範圍的商品…": "Reading items in the current area…",
  "目前範圍已載入：{count} 件站內商品{own}、{external} 件外部來源。這不是全站商品總數。": "Loaded in this area: {count} in-app items{own}, {external} external items. This is not the total for the whole site.",
  "（含 {count} 件自有預覽）": " (including {count} own-listing previews)",
  "目前條件無法由外部來源驗證，外部商品未列入。": "External sources cannot verify these filters, so external items are excluded.",
  "外部來源目前未開放，顯示站內商品。": "External sources are not currently enabled. Showing in-app items.",
  "站內商品查詢未完成：": "In-app item query is incomplete: ",
  "外部商品查詢未完成：": "External item query is incomplete: ",
  "重新搜尋": "Search again",
  "來源線索未完成讀取，已暫停自動更新；不代表沒有資料，請明確重新搜尋。": "Source items could not be fully read. Automatic updates are paused; this does not mean there is no data. Search again explicitly.",
  "搜尋等待時間": "Search wait time",
  "查詢暫時受限，請等待 {seconds} 秒後再試。等待期間可調整地圖與條件，不會自動搜尋。": "Queries are temporarily limited. Wait {seconds} seconds before retrying. You can adjust the map and filters while waiting; searches do not run automatically.",
  "等待已結束；請明確重試搜尋、載入更多或重新核對商品，不會自動執行。": "The wait has ended. Explicitly retry searching, loading more, or checking the item; nothing runs automatically.",
  "重新讀取願望選單": "Read the wish menu again",
  "重新核對此商品": "Check this item again",
  "本次查詢暫時無法完成，請稍後明確重試。": "This query could not be completed. Retry explicitly later.",
  "目前地圖範圍沒有符合條件的商品，不代表全站沒有商品。可擴大範圍或清除條件。": "No matching items in the current map area. This does not mean the whole site has no items. Expand the area or clear filters.",
  "此群聚的商品": "Items in this cluster",
  "顯示全部已載入結果": "Show all loaded results",
  "載入更多站內商品": "Load more in-app items",
  "載入更多外部商品": "Load more external items",
  "尚有未載入的商品；每個來源最多載入 500 件，超過時請縮小範圍或增加搜尋條件。": "More items remain unloaded. Each source loads at most 500 items; narrow the area or add filters to continue.",
  "商品詳情": "Item details",
  "外部來源商品": "External-source item",
  "關閉": "Close",
  "正在核對商品最新狀態…": "Checking the latest item state…",
  "品牌：": "Brand: ",
  "未提供": "Not provided",
  "新舊與狀態：": "Condition and state: ",
  "約略地點：": "Approximate location: ",
  "（非精確地址）": " (not a precise address)",
  "交付：": "Delivery: ",
  "可議價": "Negotiable",
  "不議價": "Not negotiable",
  "失效時間：": "Expires: ",
  "（台灣時間）": " (Taiwan time)",
  "開啟可分享商品頁": "Open the shareable item page",
  "外部來源 · 非站內賣家；請至原網站確認價格、庫存及交易方式。": "External source, not an in-app seller. Confirm price, stock and transaction terms on the original website.",
  "AI 補充（不是來源保證）：": "AI supplement (not a source guarantee): ",
  " 行政區中心，並非商品確切所在地。資料確認：": " District centre, not the exact item location. Last checked: ",
  "前往來源網站（{host}）": "Visit the original website ({host})",
  "來源售價 NT$ ": "Source price NT$ ",
  "互動地圖暫時無法使用，請切換「商品列表」繼續搜尋與閱覽。": "The interactive map is unavailable. Switch to Item list to continue searching and browsing.",
  "此瀏覽器不支援定位，請手動移動地圖後搜尋此範圍。": "This browser does not support location. Move the map manually, then search this area.",
  "正在取得位置；位置不會直接傳給商品來源。": "Reading location; it is not sent directly to item sources.",
  "目前位置不在台灣，請手動移動地圖搜尋。": "Your current location is outside Taiwan. Move the map manually to search.",
  "已移至所在範圍；按「搜尋此範圍」才會查詢，距離比對只使用約略中心。": "Moved to your area. Only Search this area runs a query; distance comparison uses the approximate centre.",
  "無法取得位置或未授權，仍可手動移動地圖與搜尋。": "Location is unavailable or permission was not granted. You can still move the map and search manually.",
  "願望選單無法載入；仍可搜尋一般商品，或回首頁重新整理。": "The wish menu could not load. You can still search general items or return home to refresh.",
  "無法讀取商品資料，請重試。": "Item data could not be read or verified. This does not mean there are no items. Retry explicitly.",
  "請求暫時受限；請依畫面等待提示，再明確重試，不會自動重新搜尋。": "Requests are temporarily limited. Follow the wait notice, then retry explicitly; searches do not resume automatically.",
  "登入狀態無法確認，請重新核對帳號後明確重試商品查詢。": "Sign-in could not be confirmed. Recheck your account, then retry the item query explicitly.",
  "配對排序說明無法核對，請查看商品詳情與原條件。": "The match-order explanation could not be verified. Check item details and the original filters.",
  "已包含自己刊登的配對預覽；自己的商品不能向自己購買。圖片不直接比對，文字吻合不保證同一型號或真偽。": "Includes previews of your own listings, which you cannot buy from yourself. Images are not directly compared; text matching does not guarantee the same model or authenticity.",
  "先依新近刊登分頁，每頁按吻合度排序；文字吻合不保證同一型號或商品真偽": "Recent listings are paged first, then ranked by match within each page. Text matching does not guarantee the same model or authenticity.",
  "願望名稱資訊不足，請補充名稱或型號後再比對": "The wish name has insufficient information. Add a name or model, then compare again",
  "所選商品已失效，請回首頁重新選擇。": "The selected item has expired. Return home and select another item.",
  "商品分頁重複或未前進，請重新搜尋。": "The item page repeated or did not advance. Search again.",
  "外部商品分頁重複或未前進，請重新搜尋。": "The external item page repeated or did not advance. Search again.",
  "請將地圖移回台灣範圍，或擴大搜尋。": "Move the map back to Taiwan or expand the search area.",
  "商品已失效，請重新搜尋。": "The item has expired. Search again.",
  "來源商品識別不符。": "The source item identity does not match.",
  "探索連結參數不正確。": "The explore link parameters are invalid.",
  "搜尋文字不正確。": "The search text is invalid.",
  "商品分頁識別碼不正確。": "The item page identifier is invalid.",
  "外部商品分頁識別碼不正確。": "The external item page identifier is invalid.",
  "請將地圖移回台灣範圍": "Move the map back to Taiwan",
  "搜尋文字或品牌過長": "The search text or brand is too long",
  "分類不正確": "The category is invalid",
  "篩選條件不正確": "The filters are invalid",
  "價格須為非負數，最多兩位小數": "Prices must be non-negative, with at most two decimal places",
  "最高價不可小於最低價": "The maximum price cannot be below the minimum price",
  "距離須為0.5至200公里": "Distance must be between 0.5 and 200 km",
  "商品資料回應不正確": "The item response could not be verified",
  "商品照片來源不正確": "The item photo source could not be verified",
  "商品照片重複": "Item photos are duplicated",
  "商品分頁回應不正確": "The item page response could not be verified",
  "外部商品資料不正確": "The external item data could not be verified",
  "外部商品連結不正確": "The external item link could not be verified",
  "外部商品已失效或資料不正確": "The external item has expired or its data could not be verified",
  "來源縮圖與原圖不可相同": "The source thumbnail and original image must differ",
  "外部商品分頁不正確": "The external item page could not be verified",
  "願望配對資料不正確": "The wish matching data could not be verified"
} as const;

export type ExploreCopyKey = keyof typeof english;
const chinese = () => getDisplayLocale().startsWith('zh');
export function exploreText(key: ExploreCopyKey, values: Record<string, string | number> = {}) {
  const text = chinese() ? key : english[key];
  return text.replace(/\{([a-zA-Z]+)\}/g, (match, field: string) => values[field] === undefined ? match : String(values[field]));
}
export function exploreMessage(value: string) {
  return exploreText(Object.prototype.hasOwnProperty.call(english, value) ? value as ExploreCopyKey : '無法讀取商品資料，請重試。');
}
const errorKeys: readonly string[] = ["所選商品已失效，請回首頁重新選擇。", "商品分頁重複或未前進，請重新搜尋。", "外部商品分頁重複或未前進，請重新搜尋。", "請將地圖移回台灣範圍，或擴大搜尋。", "商品已失效，請重新搜尋。", "來源商品識別不符。", "探索連結參數不正確。", "搜尋文字不正確。", "商品分頁識別碼不正確。", "外部商品分頁識別碼不正確。", "請將地圖移回台灣範圍", "搜尋文字或品牌過長", "分類不正確", "篩選條件不正確", "價格須為非負數，最多兩位小數", "最高價不可小於最低價", "距離須為0.5至200公里", "商品資料回應不正確", "商品照片來源不正確", "商品照片重複", "商品分頁回應不正確", "外部商品資料不正確", "外部商品連結不正確", "外部商品已失效或資料不正確", "來源縮圖與原圖不可相同", "外部商品分頁不正確", "願望配對資料不正確"];
export function exploreFailureKey(error: unknown): ExploreCopyKey {
  if (error instanceof ApiFailure && error.status === 401) return '登入狀態無法確認，請重新核對帳號後明確重試商品查詢。';
  if (error instanceof ApiFailure && error.status === 429) return error.retryAfterMs > 0
    ? '請求暫時受限；請依畫面等待提示，再明確重試，不會自動重新搜尋。'
    : '本次查詢暫時無法完成，請稍後明確重試。';
  return error instanceof Error && errorKeys.includes(error.message) ? error.message as ExploreCopyKey : '無法讀取商品資料，請重試。';
}
const notices: readonly string[] = ['已包含自己刊登的配對預覽；自己的商品不能向自己購買。圖片不直接比對，文字吻合不保證同一型號或真偽。', '先依新近刊登分頁，每頁按吻合度排序；文字吻合不保證同一型號或商品真偽', '願望名稱資訊不足，請補充名稱或型號後再比對'];
export function exploreNotice(value: string) { return exploreText(notices.includes(value) ? value as ExploreCopyKey : '配對排序說明無法核對，請查看商品詳情與原條件。'); }
export function exploreTime(value: string) { return new Date(value).toLocaleString(chinese() ? 'zh-TW' : 'en-US', { timeZone: 'Asia/Taipei' }); }
export function exploreSourcePrice(item: ExternalListing) { return chinese() ? externalPrice(item) : externalPrice(item).replace(/^來源售價 /, 'Source price '); }
const categories: Record<string, readonly [string, string]> = { electronics: ['電子產品','Electronics'], home: ['居家生活','Home and living'], fashion: ['服飾配件','Fashion and accessories'], sports: ['運動戶外','Sports and outdoors'], books: ['書籍','Books'], toys: ['玩具','Toys'], other: ['其他','Other'] };
export function exploreCategory(key: string) { return categories[key]?.[chinese() ? 0 : 1] ?? exploreText('未提供'); }
const reasons: Record<string, string> = { NAME: 'Name or brand includes wish keywords', BRAND: 'Matches your selected brand', CATEGORY: 'Matches your selected category', CONDITION: 'Matches your new or used preference', DELIVERY: 'Matches your delivery preference', BUDGET: 'The listing price is within your purchase budget', BUDGET_UNKNOWN: 'Budget currency differs; no conversion or price match is claimed', RECENTLY_VERIFIED: 'The seller confirmed the listing within 7 days; this is not platform authenticity verification or transaction protection', FRESH: 'Listed within the last 7 days' };
export function exploreReason(reason: WishMatch['reasons'][number], distanceKm: number | null) {
  if (chinese()) return reason.text;
  if (reason.code === 'NAME') {
    if (reason.text === '商品名稱包含你的願望名稱') return 'The item title includes your wish name';
    const prefix = '名稱／品牌包含願望關鍵字：';
    if (reason.text.startsWith(prefix)) return 'Name or brand includes wish keywords: ' + reason.text.slice(prefix.length);
  }
  if (reason.code === 'DISTANCE' && distanceKm !== null) return `Approximately ${distanceKm} km from the selected approximate centre, not a precise meetup location`;
  return reasons[reason.code] ?? 'Match reason could not be verified';
}
