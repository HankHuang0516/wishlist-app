import { getDisplayLocale } from '../utils/localization';
const en = {
  slow: 'The map is slow or unavailable. You can still use the item list.',
  resources: 'Some map resources failed to load. Item data is unaffected; use the list.',
  cluster: 'Cluster data changed. Try the cluster again or use the item list.',
  unavailable: 'This browser cannot start the interactive map. Use the item list.',
  layer: 'Map item layers could not be updated. Use the list for current results.',
  photos: 'Some item thumbnails failed to load. View photos in the list.',
  externalPhotos: 'Some external thumbnails failed to load. Open a marker or view the source in the list.',
  external: 'External source: {name}, {price}', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
  attribution: 'Toggle map attribution', title: 'Item map',
  region: 'Item exploration map; the item list also supports keyboard operation',
  notice: 'Green: in-app listings · Orange: external sources. Locations are approximate. Open cluster counts for overlapping items or use the list. Basemap: OpenFreeMap/OpenStreetMap.',
};
const zh: Record<keyof typeof en, string> = {
  slow: '地圖載入較慢或無法連線，仍可切換商品列表。', resources: '部分地圖資源無法載入，商品資料不受影響，可使用列表。',
  cluster: '群聚資料已變動，請再點一次，或切換商品列表。', unavailable: '此瀏覽器無法啟動互動地圖，請使用商品列表。',
  layer: '地圖商品圖層無法更新，請使用列表查看最新搜尋結果。', photos: '部分商品縮圖未能載入，請從列表查看照片。',
  externalPhotos: '部分外部商品縮圖未能載入，仍可點擊標記或從列表查看來源。', external: '外部來源：{name}，{price}',
  zoomIn: '放大地圖', zoomOut: '縮小地圖', attribution: '顯示地圖來源', title: '商品地圖',
  region: '商品探索地圖，亦可切換商品列表使用鍵盤操作',
  notice: '綠色：站內商品 · 橘色：外部來源。位置為約略範圍；重疊商品可點擊群聚數量，或切換列表。底圖：OpenFreeMap／OpenStreetMap。',
};
export function mapText(key: keyof typeof en, values: Record<string, string> = {}) {
  return (getDisplayLocale().startsWith('zh') ? zh : en)[key].replace(/\{([a-zA-Z]+)\}/g, (match, field: string) => values[field] ?? match);
}
