export type Category = { id: string; label: string; en: string; icon: string; children: { id: string; label: string; en: string }[] };
const category = (id: string, label: string, en: string, icon: string, children: [string, string, string][]): Category => ({ id, label, en, icon, children: [...children.map(([id, label, en]) => ({ id, label, en })), ...(id !== 'other' ? [{id:'unclassified',label:'尚未細分類',en:'Not yet classified'}] : [])] });
// Stable discovery IDs are additive. They never replace the APP's seven legacy
// Listing.category values or modify seller/source assertions.
export const discoveryCatalog: Category[] = [
  category('electronics', '3C數位', 'Electronics', 'monitor', [
    ['phones','手機','Phones'],['tablets','平板','Tablets'],['laptops','筆記型電腦','Laptops'],['desktops','桌機','Desktops'],['monitors','電腦螢幕','Monitors'],['audio','耳機音響','Audio'],['cameras','相機攝影','Cameras'],['gaming','遊戲主機','Gaming'],['accessories','周邊配件','Accessories']]),
  category('appliances','家電','Appliances','cooking-pot',[
    ['kitchen','廚房家電','Kitchen appliances'],['cleaning','清潔家電','Cleaning'],['climate','空調除濕','Climate'],['laundry','洗衣烘衣','Laundry'],['personal','個人小家電','Personal care']]),
  category('home','家具家居','Home','armchair',[
    ['furniture','桌椅家具','Furniture'],['bedding','床具寢具','Bedding'],['storage','收納整理','Storage'],['kitchenware','廚房餐具','Kitchenware'],['decor','燈具擺飾','Lighting & decor']]),
  category('fashion','服飾配件','Fashion','shirt',[
    ['clothing','衣著','Clothing'],['shoes','鞋靴','Shoes'],['bags','包袋行李箱','Bags & luggage'],['accessories','飾品手錶','Jewelry & watches']]),
  category('kids','親子育兒','Baby & kids','baby',[
    ['baby','嬰幼用品','Baby care'],['clothing','童裝童鞋','Kids clothing'],['strollers','推車汽座','Strollers & car seats'],['toys','玩具教具','Learning & toys']]),
  category('outdoors','運動戶外','Sports & outdoors','tent',[
    ['fitness','健身器材','Fitness'],['sports','球類運動','Sports'],['camping','露營登山','Camping'],['cycling','自行車','Cycling'],['gear','運動裝備','Sports gear']]),
  category('books','書籍文具','Books & stationery','book-open',[
    ['fiction','文學小說','Fiction'],['business','商業學習','Business'],['comics','漫畫','Comics'],['children','童書繪本','Children’s books'],['language','語言考試','Language & exams'],['stationery','文具辦公','Stationery'],['general','其他書籍','Other books']]),
  category('collectibles','興趣收藏','Hobbies','puzzle',[
    ['blocks','LEGO積木','Building blocks'],['figures','模型公仔','Models & figures'],['games','桌遊拼圖','Board games'],['music','樂器音樂','Musical instruments'],['plush','玩偶布偶','Plush toys'],['crafts','手作收藏','Crafts & art']]),
  category('beauty','美妝保養','Beauty','flower-2',[
    ['skincare','臉部保養','Skin care'],['makeup','彩妝','Makeup'],['fragrance','香氛','Fragrance'],['hair','美髮','Hair care']]),
  category('pets','寵物生活','Pets','paw-print',[
    ['care','犬貓用品','Dog & cat care'],['habitat','飼養設備','Habitats'],['travel','外出清潔','Travel & cleaning']]),
  category('other','其他商品','Other','shapes',[
    ['food','食品飲料','Food & drinks'],['vehicle','汽機車用品','Vehicle accessories'],['misc','尚未細分類','Not yet classified']])
];
type Rule = [string, string, RegExp];
const rules: Rule[] = [
  ['electronics','accessories',/手機殼|保護殼|保護貼|充電線|充電器|變壓器|電源供應器|轉接|鍵盤|滑鼠|記憶卡|硬碟|ssd|router|路由器|防潮櫃/i],
  ['books','children',/童書|繪本|來自北極的禮物|學習書|幼兒讀本/i],
  ['books','comics',/漫畫|comic|manga/i],
  ['books','stationery',/原子筆|中性筆|筆芯|文具|影印紙|辦公用品|自動鉛筆/i],
  ['books','language',/多益|toeic|ielts|英語|英文課本|考試|教科書/i],
  ['books','business',/商業|投資|經理人|開店|致富|經濟學|管理學|華爾街/i],
  ['books','fiction',/二手書.*(?:小說|文學|諾貝爾|邊城|張愛玲|沈從文|鹽田兒女)|文學獎|fiction|novel/i],
  ['books','general',/二手書|書籍|散文|全集|史書|詩集/i],
  ['kids','strollers',/嬰兒.*推車|兒童.*汽座|嬰兒.*汽座|汽車安全座椅|joie.*float|嬰兒手推車|兒童推車/i],
  ['kids','clothing',/童裝|童鞋|學步鞋|嬰兒帽|兒童.*睡衣|幼兒.*衣|防走失.*背包/i],
  ['kids','baby',/吸乳器|奶瓶|包巾|尿布|嬰兒床|安全圍欄|哺乳|寶寶用品/i],
  ['collectibles','plush',/絨毛|布偶|玩偶|草泥馬/i],
  ['collectibles','blocks',/lego|樂高|積木|polym/i],
  ['collectibles','figures',/公仔|模型|變形機器人|遙控跑車|transformer|戰鬥陀螺/i],
  ['collectibles','games',/桌遊|拼圖|棋盤|麻將|board game/i],
  ['collectibles','music',/吉他|小提琴|鋼琴|烏克麗麗|樂器|電子琴/i],
  ['kids','toys',/洗澡玩具|教具|啟蒙|兒童玩具/i],
  ['other','vehicle',/車用|安全帽|機車.*配件|汽車.*配件|車載/i],
  ['electronics','audio',/耳機|喇叭|音響|等化器|擴大機|airpods|galaxy\s*buds|headphone|speaker/i],
  ['electronics','cameras',/相機|攝影機|鏡頭|拍立得|camera|polaroid/i],
  ['electronics','tablets',/ipad|平板|tablet/i],
  ['electronics','laptops',/macbook|筆記型電腦|筆電|laptop|notebook/i],
  ['electronics','desktops',/imac|桌上型電腦|桌機|迷你電腦|電腦主機/i],
  ['electronics','gaming',/遊戲主機|遊戲手把|ps5|playstation|xbox|nintendo|switch主機/i],
  ['electronics','phones',/iphone|galaxy\s*(?:s\d|a\d|note|z\s*(?:fold|flip)|fold|flip)|智慧型手機|智能手機|pixel\s*\d|sony.*xperia/i],
  ['electronics','monitors',/螢幕|顯示器|monitor|液晶顯示/i],
  ['appliances','kitchen',/料理鍋|電子鍋|電鍋|快煮壺|熱水壺|烤箱|冰箱|咖啡機|氣炸|微波爐|果汁機|調理機|廚餘機/i],
  ['appliances','cleaning',/吸塵器|清洗機|掃地機|蒸氣拖把/i],
  ['appliances','climate',/除濕機|空氣清淨|冷氣|電暖器|電風扇|立扇|抽風機/i],
  ['appliances','laundry',/洗衣機|烘衣機|乾衣機/i],
  ['appliances','personal',/吹風機|刮鬍刀|電動牙刷|美容儀|按摩棒/i],
  ['fashion','shoes',/女鞋|男鞋|跑鞋|慢跑鞋|休閒鞋|球鞋|鞋靴|高跟鞋|鉛筆鞋|skechers|sneaker/i],
  ['fashion','bags',/行李箱|旅行包|背包|後背包|托特包|保溫袋|手提包|肩背包|登機包/i],
  ['fashion','accessories',/手錶|石英錶|手鍊|手鐲|耳飾|耳環|項鍊|墜|珍珠|水晶/i],
  ['fashion','clothing',/外套|背心|球衣|t恤|t-shirt|連帽|洋裝|長褲|短褲|襯衫|毛衣/i],
  ['home','bedding',/床墊|床架|床包|棉被|枕|寢具|保潔墊/i],
  ['home','storage',/收納|抽屜櫃|整備箱|工具箱|置物架|收納箱/i],
  ['home','furniture',/沙發|單椅|桌|電視櫃|懶骨頭|衣櫃|傢俱|家具|書櫃|水槽工作台/i],
  ['home','kitchenware',/餐具|碗盤|炒鍋|平底鍋|刀具|水杯|保溫瓶|餐盒/i],
  ['home','decor',/燈具|檯燈|落地燈|雕刻|擺飾|掛畫|化妝鏡|花瓶/i],
  ['outdoors','fitness',/運動腳踏車|健身|啞鈴|彈力帶|瑜珈|跑步機/i],
  ['outdoors','cycling',/自行車|腳踏車|單車/i],
  ['outdoors','camping',/露營|帳篷|睡袋|登山|營燈/i],
  ['outdoors','sports',/球拍|籃球|足球|棒球|羽毛球|網球/i],
  ['outdoors','gear',/直排輪|滑板|護膝|護具/i],
  ['pets','habitat',/寵物.*跑輪|寵物籠|鳥籠|魚缸|飼養箱/i],
  ['pets','care',/貓砂|犬糧|貓糧|狗糧|寵物|貴賓成犬|royal canin/i],
  ['beauty','makeup',/彩妝|睫毛|口紅|粉底|眼影/i],
  ['beauty','skincare',/保養|精華液|面膜|乳液/i],
  ['beauty','fragrance',/香水|香氛/i],
  ['beauty','hair',/洗髮|護髮|染髮/i],
  ['other','food',/餅乾|零食|水餃|碗麵|泡麵|洋芋片|飲料|咖啡豆/i]
];
const fallback: Record<string, [string,string]> = { electronics:['electronics','unclassified'],home:['home','unclassified'],fashion:['fashion','unclassified'],sports:['outdoors','unclassified'],books:['books','general'],toys:['kids','unclassified'] };
export function classifyDiscovery(title: string, legacyCategory?: string | null) {
  const text = title.normalize('NFKC');
  // Seller condition notes and included accessories must not replace the actual
  // product subject (e.g. an iPhone with a damaged screen is still a phone).
  const subject = text.split(/[（(，,；;]/u)[0].split(/(?:\s|[＋+、])(?:附(?:贈|送)?|含|搭配)/u)[0].trim();
  const found = rules.find(([, , pattern]) => pattern.test(subject)) ?? rules.find(([, , pattern]) => pattern.test(text));
  const [mainId, subId] = found ? found : fallback[legacyCategory ?? ''] ?? ['other','misc'];
  return { mainId, subId, method: found ? 'TITLE_RULE' : legacyCategory && fallback[legacyCategory] ? 'LEGACY_CATEGORY' : 'UNCLASSIFIED', version: 2 };
}
export function sourcePrice(facts: unknown): { price: number | null; text: string; currency: 'TWD' | null; unitVerified: boolean } {
  const f = facts && typeof facts === 'object' ? facts as Record<string,unknown> : {};
  const text = typeof f.priceText === 'string' ? f.priceText.trim() : '';
  const currencyText = String(f.currencyStatus ?? '');
  const currency = /TWD|NT(?:\$|\b)|台幣|臺幣/i.test(currencyText) && !/UNKNOWN|未.*(?:確認|核實)|不明/i.test(currencyText) ? 'TWD' as const : null;
  const part = text.split(/[；;。]/)[0].replace(/^原(?:貼文|帖)(?:標示|標價|價格)\s*[:：]?\s*/, '').trim();
  const m = part.match(/^(?:NT\$?|TWD|NTD|\$)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*(?:元|TWD|NTD)?$/i);
  const n = m ? Number(m[1].replace(/,/g,'')) : NaN;
  return { price: currency && Number.isFinite(n) && n >= 0 && n <= 9_999_999_999.99 ? n : null, text, currency,
    unitVerified: f.priceUnitStatus === 'SOURCE_STATED' };
}
export function statedCondition(title:string):'NEW'|'USED'|'UNKNOWN'{
  const used=/二手|[五六七八九](?:五|九|點五)?成新|[5-9](?:\.5)?成新|使用過|用過/.test(title)&&!/非二手|不是二手/.test(title);
  const fresh=/(?:^|[（(，,\s])全新/.test(title)&&!/非全新|不是全新/.test(title);
  if(used&&fresh)return 'UNKNOWN';
  return used?'USED':fresh?'NEW':'UNKNOWN';
}
