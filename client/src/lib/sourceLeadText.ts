import { getDisplayLocale } from '../utils/localization';

const english = {
  title: 'Source lead map', notice: 'Stock, content rights and transactions still require confirmation. Source leads do not count as verified items. Public meeting points are not seller or stock locations.',
  count: 'Source leads: {items} · Public places: {points}', loading: 'Reading sources…',
  readFailed: 'Sources could not be read right now', invalidResponse: 'Invalid source response', cursorStalled: 'Source pagination did not advance',
  operationFailed: 'The operation is unconfirmed. Read the latest inquiry state; this does not mean it was sent to the seller.',
  unknownEmpty: 'The previous result is still unconfirmed. Do not create a duplicate question.',
  empty: 'No saved inquiry yet. Enter your question and choose Save question to create one.',
  noInquiry: 'No inquiry is available for this action. Read to confirm; no duplicate record will be created.',
  invalidInquiry: 'Invalid inquiry response. Read to confirm; do not resend.',
  previousUnknown: 'The previous result is unconfirmed. Read again or withdraw; do not add a duplicate question.',
  originalUnknown: 'The previous result is unconfirmed. Read the saved inquiry or withdraw; do not resend a new question.',
  retryOriginal: 'The previous result is unconfirmed. Retry the same operation first.',
  changed: 'The questions have changed. Read them again before confirming consent.',
  map: 'Taiwan source lead location map', basemap: 'OpenStreetMap Taiwan public places', mapTitle: 'Public place source lead map',
  mapCount: '{count}', locationNotice: 'Coordinates come from public sources; accuracy is unknown. Confirm the actual place with the original seller.',
  choose: 'Choose a source', unavailableOption: 'Original selection is not public right now', originalSource: 'View original source',
  unavailable: 'The original selection is not in the public list. You can still read a saved inquiry or withdraw; another source will not be selected automatically.',
  inquiry: 'Seller inquiry', inquiryNotice: 'Only your questions are saved. A human may forward them after verifying the original seller contact route. No order is created and stock is not promised.',
  login: 'Sign in to ask', read: 'Read saved inquiry', question: 'Question', save: 'Save question', receipt: 'Inquiry ID: {id} · {state} · {delivery}',
  review: 'Delivery evidence requires human review', delivered: 'Forwarded by a human', notDelivered: 'Not sent to the seller',
  consent: 'Consent to forward only the questions above to the verified original seller', cancel: 'Withdraw inquiry',
};
type Key = keyof typeof english;
const chinese: Record<Key, string> = {
  title: '來源線索地圖', notice: '庫存、圖文權利與交易仍待確認；來源線索不計入已驗證商品達成率。公共面交點不是賣家或現貨所在地。',
  count: '{items} 件來源線索・{points} 個公共地點', loading: '讀取中…',
  readFailed: '來源暫時無法讀取', invalidResponse: '來源回應無效', cursorStalled: '分頁未前進',
  operationFailed: '操作未完成，請讀取最新收件狀態；不代表已送給賣家', unknownEmpty: '上次操作結果仍待確認；請勿新增重複問題',
  empty: '尚無已存詢問；填寫內容後按保存問題才會建立', noInquiry: '尚無可處理的詢問，請讀取確認；不建立重複紀錄',
  invalidInquiry: '收件回應無效，請讀取確認；不重送', previousUnknown: '上次操作結果仍待確認；可重新讀取或撤回，請勿新增重複問題',
  originalUnknown: '上次操作結果待確認，請讀取已存詢問或撤回；不重送新問題', retryOriginal: '上次操作結果待確認，請先重試同一操作',
  changed: '問題內容已更新，請重新閱讀後再次確認同意', map: '台灣來源線索位置地圖', basemap: 'OpenStreetMap 台灣公共地點', mapTitle: '公共地點來源線索地圖',
  mapCount: '{count}件', locationNotice: '地圖位置依公開來源座標；精度未知，實際地點仍應向原賣家確認。',
  choose: '選擇線索', unavailableOption: '原選擇目前未公開', originalSource: '查看原始來源',
  unavailable: '原選擇目前不在公開清單；仍可讀取已存詢問或撤回，不會自動改選另一筆。',
  inquiry: '委託詢問', inquiryNotice: '只保存你的問題；確認原賣家聯絡路由後才能人工轉交。不建立訂單或承諾有貨。',
  login: '登入後詢問', read: '讀取已存詢問', question: '詢問內容', save: '保存問題', receipt: '詢問編號：{id} · {state} · {delivery}',
  review: '送達證據待人工審查', delivered: '已人工轉交', notDelivered: '尚未送給賣家', consent: '同意只轉交上列問題給核實的原賣家', cancel: '撤回委託',
};
export function sourceLeadText(key: Key, values: Record<string, string | number> = {}) {
  return (getDisplayLocale().startsWith('zh') ? chinese : english)[key].replace(/\{([a-zA-Z]+)\}/g, (match, field: string) => values[field] === undefined ? match : String(values[field]));
}
