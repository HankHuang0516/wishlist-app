import { getDisplayLocale } from '../utils/localization';

const english = {
  'EClaw 合作名片': 'EClaw partnership contact card',
  '供給合作｜Wishlist.ai': 'Supply partnerships | Wishlist.ai',
  '合作原則': 'Partnership principles',
  '全台二手商品合作招募，先雙北小量試點': 'Taiwan-wide second-hand partnerships, starting with a small Taipei and New Taipei pilot',
  '讓好物，遇見正在尋找它的人。': 'Help good things find the people looking for them.',
  'Wishlist.ai 結合願望清單與附近商品探索，邀請二手店、寄賣夥伴和公共拍賣單位， 一起測試有來源、可更新、能導回原站的商品曝光方式。': 'Wishlist.ai connects wishlists with nearby item discovery. We invite second-hand shops, consignment partners and public auction organizations to test listings with clear sources, updates and links back to the original site.',
  '查看合作方式': 'Explore the process',
  '聯絡 Wishlist.ai': 'Contact Wishlist.ai',
  '此頁是合作邀請，不表示任何來源已授權、商品已匯入，或 Wishlist.ai 為外站商品的賣家。': 'This is a partnership invitation. It does not mean a source has granted permission, items have been imported, or Wishlist.ai sells items from other sites.',
  '讓需求找到供給': 'Connect wishes with available items',
  '讓願望與商品資訊有機會相互比對；試點不保證流量、成交或特定排名。': 'The pilot explores matching wishes with item information. It does not guarantee traffic, sales or a particular ranking.',
  '交易方式由來源決定': 'The source sets the transaction method',
  '外站商品標明出處並導回原頁；賣家也可自行在 Wishlist.ai 刊登。競標底價不會偽裝成固定售價。': 'External items show their source and link to the original page. Sellers can also list directly on Wishlist.ai. An auction starting bid is never presented as a fixed sale price.',
  '授權與撤回優先': 'Permission and withdrawal come first',
  '先確認商品、照片與文字的使用範圍；售出、失效或撤回時停止展示，不擅自轉載私人資訊。': 'Agree on permitted use of items, photos and text first. Stop displaying sold, expired or withdrawn items, and do not republish private information without permission.',
  '合作流程': 'Partnership process',
  '先小量驗證，再決定是否擴大': 'Start small before deciding to expand',
  '01 確認權利與展示方式。': '01 Agree on rights and presentation.',
  '共同核對可用的商品文字、圖片、標示出處和 AI 處理範圍。': 'Review the permitted item text, images, source attribution and scope of AI processing together.',
  '02 提供少量在售樣本。': '02 Supply a few items currently for sale.',
  '先以可核對的單件商品和更新訊號測試，不批量複製整站。': 'Test individual verifiable items and their update signals without copying an entire site.',
  '03 私人預檢與審核。': '03 Complete private checks and review.',
  '核對價格、行政區、時效及撤下方式後，才討論是否對外顯示。': 'Check prices, districts, freshness and withdrawal methods before discussing public display.',
  '一件商品需要哪些資料？': 'What information does each item need?',
  '可追蹤的商品 ID 與原始商品連結': 'A traceable item ID and original item link',
  '商品名稱、實際交易方式與明示價格': 'Item name, actual transaction method and stated price',
  '可展示的原圖／縮圖及其使用授權': 'Displayable original images or thumbnails and permission to use them',
  '商品實際所在縣市／行政區／門市、最後確認在售時間與失效時間': 'Actual county or city, district and shop, last verified availability and expiry',
  '售出、下架或撤回時的更新方式': 'How sold, removed or withdrawn items are updated',
  '如為競標，請另提供起標價、目前出價、結標時間與狀態；我們會先確認是否適合以「外站競標」呈現，不套用一般固定售價刊登。': 'For auctions, also provide the starting bid, current bid, closing time and status. We first review whether an external auction presentation is appropriate, rather than using an ordinary fixed-price listing.',
  '歡迎先討論一小批商品': 'Let’s discuss a small set of items',
  '請提供來源名稱、負責窗口、3–10 件真實在售商品範例，以及可使用的圖文與更新方式。試點前會先確認權利與作業範圍，不需要提供賣場密碼。': 'Provide the source name, a contact, 3–10 real items currently for sale, permitted images and text, and an update method. We agree on rights and scope before the pilot. No marketplace password is needed.',
  '提出合作意向': 'Submit a partnership inquiry',
} as const;

export function partnerLandingText(key: keyof typeof english) {
  return getDisplayLocale().startsWith('zh') ? key : english[key];
}
