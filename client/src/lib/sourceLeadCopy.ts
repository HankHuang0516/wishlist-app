import { getDisplayLocale } from '../utils/localization';
import type { ContactRouting } from './sourceLeadData';

const english = {
  '目前沒有可顯示的商品圖片': 'No item image is available',
  '圖片暫時無法載入': 'The image could not be loaded',
  '圖片載入中…': 'Loading image…',
  '來源商品圖片總數尚待核對': 'The source image total still needs verification',
  '已知來源圖片尚未完整匯入': 'Known source images have not all been imported',
  '來源商品圖片已完整收錄': 'All source item images have been imported',
  '圖片完整性需重新核對': 'Image completeness needs to be checked again',
  '來源圖片超過目前支援張數，待處理': 'The source has more images than currently supported; review is pending',
  '（來源{source}張／已收錄{imported}張）': ' (Source: {source}; imported: {imported})',
  '實物圖{physical}張／專屬規格或包裝圖{other}張': 'Physical-item images: {physical}; item-specific specifications or packaging: {other}',
  '本次已成功查看{loaded}張': 'Images successfully viewed this visit: {loaded}',
  '，{failed}張載入失敗': '; failed to load: {failed}',
  '第{index}張，共{count}張已收錄圖片': 'Image {index} of {count} imported images',
  '上一張來源照片': 'Previous source image',
  '下一張來源照片': 'Next source image',
  '上一張': 'Previous',
  '下一張': 'Next',
  '原始照片順序': 'Original image order',
  '查看第{index}張來源照片': 'View source image {index}',
  '外部來源 · 庫存與交易待確認': 'External source · stock and transaction terms unconfirmed',
  '外部來源 · 庫存待確認': 'External source · stock unconfirmed',
  '{count} 筆來源線索；不是已確認在售商品。': '{count} source leads; these are not confirmed available items.',
  '目前篩選條件不能由來源線索驗證，來源層未列入。': 'Source leads cannot verify the current filters and are excluded.',
  '外部來源 · Wishlist AI代問，非站內賣家；庫存與交易待確認。': 'External source · inquiries handled by Wishlist AI, not an in-app seller; stock and transaction terms unconfirmed.',
  '原賣家收訊路由待核實，商品問題可先交 Wishlist AI 收件。': 'The original seller contact route needs verification. Wishlist AI can receive your item questions first.',
  '原賣家收訊路由已有獨立核實，仍需逐次核對有效性及外送回執。': 'The original seller contact route has been independently verified. Its validity and forwarding evidence still need checking for each inquiry.',
  '原貼文與作者身份不等於可收訊路由；尚未核實原賣家可用的聯絡入口，未外送。': 'The original post and author identity do not establish a contact route. An available seller contact route has not been verified; nothing has been forwarded.',
  '聯絡賣家': 'Contact seller',
  '原始來源': 'Original source',
  '來源線索地圖': 'Source lead map',
  '庫存、圖文權利與交易仍待確認；來源線索不計入已驗證商品達成率。公共面交點不是賣家或現貨所在地；概略位置是縣市示意，非取貨點。': 'Stock, content rights and transaction terms still need confirmation. Source leads do not count as verified supply. Public meetup points are not seller or stock locations; approximate county locations are not pickup points.',
  '{count} 件來源線索・{points} 個公共／概略示意位置': '{count} source leads · {points} public or approximate locations',
  '讀取中…': 'Loading…',
  '來源讀取尚未確認。': 'The source read is unconfirmed.',
  '來源線索未完成讀取，已暫停自動更新；不代表沒有資料，請明確重新讀取。': 'Source leads could not be fully read. Automatic updates are paused; this does not mean there is no data. Reload explicitly.',
  '重新讀取來源': 'Reload sources',
  '{seconds} 秒後可再試。': 'Try again in {seconds}s.',
  '台灣來源線索位置地圖': 'Taiwan source lead location map',
  'OpenStreetMap 台灣來源示意位置': 'OpenStreetMap Taiwan source illustration',
  '來源線索公共與概略位置地圖': 'Public and approximate source locations',
  '{count}件': '{count} items',
  '地圖含公共地點與縣市示意點；概略位置，非取貨點，不提供精確距離或導航。實際面交地點待確認可轉告後私訊買家。': 'The map includes public places and approximate county points, not pickup points. It does not provide precise distances or directions. The actual meetup place still needs confirmation before being relayed privately to the buyer.',
  '來源商品清單': 'Source item list',
  '查看 {title}': 'View {title}',
  '選擇線索': 'Select a source lead',
  '概略位置，非取貨點': 'Approximate location, not a pickup point',
  '公共面交點': 'Public meetup point',
  '，非現貨所在地': ', not the stock location',
  '商品說明': 'Item description',
  '查看原始來源': 'View original source',
} as const;

export type SourceLeadCopyKey = keyof typeof english;
export function sourceLeadText(key: SourceLeadCopyKey, values: Record<string, string | number> = {}) {
  return (getDisplayLocale().startsWith('zh') ? key : english[key]).replace(/\{([a-zA-Z]+)\}/g,
    (match, field: string) => values[field] === undefined ? match : String(values[field]));
}

/** Translate generated UI reasons only; retain independently recorded source text. */
export function sourceLeadRoutingReason(routing?: ContactRouting) {
  if (!routing) return sourceLeadText('原賣家收訊路由待核實，商品問題可先交 Wishlist AI 收件。');
  if (routing.reason === '原賣家收訊路由已有獨立核實，仍需逐次核對有效性及外送回執。')
    return sourceLeadText('原賣家收訊路由已有獨立核實，仍需逐次核對有效性及外送回執。');
  if (routing.reason === '原貼文與作者身份不等於可收訊路由；尚未核實原賣家可用的聯絡入口，未外送。')
    return sourceLeadText('原貼文與作者身份不等於可收訊路由；尚未核實原賣家可用的聯絡入口，未外送。');
  return routing.reason;
}
