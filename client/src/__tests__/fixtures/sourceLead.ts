import type { SourceLead } from '../../lib/sourceLeadData';

export function makeSourceLead(number = 1): SourceLead {
  const id = '11111111-1111-4111-8111-' + String(number).padStart(12, '0');
  const date = new Date().toISOString(), canonicalUrl = 'https://example.invalid/source/' + number;
  return {
    id, kind:'SOURCE_LEAD', title:'來源 '+number, summary:'來源原文 {name} $&', canonicalUrl,
    county:'臺南市', district:'永康區', publicPlaceName:'公開地點', publicAddress:'公共地址', latitude:23, longitude:120.2,
    postedEarliestAt:date, postedLatestAt:date, checkedAt:date, stockStatus:'UNKNOWN', qualifiedSupply:false, checkoutEnabled:false,
    notice:'來源待確認', coordinateSourceUrl:'https://www.openstreetmap.org/node/1', coordinateAttribution:null,
    publicFacts:{priceText:'原帖標價：250元',priceUnitStatus:'原文',currencyStatus:'原文',sourceAccessNotice:'原來源使用說明 {source} $&',originalDateLabel:'原帖日期文字',locationRelation:'原地點關係',coordinateQualityNotes:[]},
    contactRouting:{status:'UNVERIFIED',reason:'原貼文與作者身份不等於可收訊路由；尚未核實原賣家可用的聯絡入口，未外送。',checkedAt:null},
    media:[1,2].map(index=>{
      const mid='22222222-2222-4222-8222-'+String(number*10+index).padStart(12,'0');
      const path='https://example.invalid/api/source-leads/'+id+'/media/'+mid+'/';
      return {id:mid,sourceUrl:canonicalUrl,imageUrl:path+'image',thumbnailUrl:path+'thumbnail',alt:'原照片 '+index+' {title} $&'};
    }),
    photoCompleteness:{status:'IMPORTED_COMPLETE',sourceCount:2,physicalSourceCount:1,importedCount:2,limit:32},
  };
}
