// These are category-navigation shortcuts, not assertions that a product has
// a particular brand/model. Product keyword matching remains evidence-based.
const aliases:Record<string,string[]>={
 electronics:['電子產品','3c','數位'],appliances:['電器','家用電器'],home:['居家','傢俱'],fashion:['穿搭','衣服'],kids:['母嬰','小孩','寶寶'],outdoors:['運動','戶外'],books:['書本','書籍','辦公'],collectibles:['收藏','嗜好'],beauty:['保養品','化妝品'],pets:['毛孩'],
 'electronics.phones':['手機','智慧型手機','iphone','android'],
 'electronics.tablets':['平板電腦','ipad'],
 'electronics.laptops':['筆電','手提電腦','notebook','laptop','macbook'],
 'electronics.desktops':['桌上型電腦','桌電','主機','imac'],
 'electronics.monitors':['顯示器','電腦屏幕','monitor','display'],
 'electronics.audio':['喇叭','音箱','headphone','speaker','耳麥'],
 'electronics.cameras':['攝影','拍立得','拍立拍','單眼','camera','polaroid'],
 'electronics.gaming':['電玩','遊戲設備','ps5','playstation','switch','xbox'],
 'electronics.accessories':['手機殼','充電器','鍵盤','滑鼠','周邊'],
 'appliances.kitchen':['電鍋','烤箱','冰箱','氣炸鍋'],
 'appliances.cleaning':['吸塵器','掃地機','清洗機'],
 'appliances.climate':['冷氣','風扇','除濕機','清淨機'],
 'home.furniture':['桌子','椅子','沙發','櫃子'],
 'home.bedding':['床墊','寢具','枕頭'],
 'home.storage':['收納箱','收納櫃','置物架'],
 'fashion.clothing':['上衣','褲子','外套','衣服'],
 'fashion.shoes':['鞋子','球鞋','靴子'],
 'fashion.bags':['背包','行李箱','旅行箱'],
 'kids.strollers':['嬰兒車','安全座椅','汽座'],
 'books.children':['繪本','童書'],
 'books.comics':['漫畫','manga','comic'],
 'collectibles.blocks':['積木','lego','樂高'],
 'collectibles.plush':['布偶','絨毛','玩偶'],
};
type Label={id:string;label:string;en:string};
const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().trim();
export function matchesCategorySearch(search:string,parent:Label,child?:Label){
 const haystack=normalize([parent.label,parent.en,...(aliases[parent.id]??[]),...(child?[child.label,child.en,...(aliases[parent.id+'.'+child.id]??[])]:[])].join(' '));
 return normalize(search).split(/\s+/).filter(Boolean).every(word=>haystack.includes(word));
}
