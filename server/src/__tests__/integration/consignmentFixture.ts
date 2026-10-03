import {randomUUID} from 'crypto';
import {parseLead,digest} from '../../lib/sourceLeadRules';
import {parseConsignmentQuery,consignmentEligible,consignmentMatches,consignmentResult} from '../../lib/consignmentQuery';
export function fixture(){
 const now=new Date(),sourceUrl='https://www.facebook.com/groups/123456789/posts/987654321';
 const lead={id:randomUUID(),...parseLead({archiveItemId:'FB123456789-987654321-01',libraryFileId:'libfile_'+'a'.repeat(32),archiveVersion:3,archiveSha256:'a'.repeat(64),title:'來源線索：合成代售二手書',summary:'合成測試，非真實商品。',canonicalUrl:sourceUrl,county:'臺南市',district:'永康區',publicPlaceName:'合成公開面交點',publicAddress:'臺南市永康區合成路123號',latitude:23.0,longitude:120.236,postedEarliestAt:new Date(now.getTime()-86400000).toISOString(),postedLatestAt:new Date(now.getTime()-86400000).toISOString(),checkedAt:now.toISOString(),evidence:{sourceUrl,sourcePublic:true,publicSourceRef:'self:synthetic-public',dateRef:'self:synthetic-date',locationRef:'self:synthetic-location',coordinateRef:'self:synthetic-coordinate',locationSourceUrl:'https://public.example.invalid/place/qa',coordinateSourceUrl:'https://public.example.invalid/map/qa',publicPlace:true,locationType:'PUBLIC_MEETING_POINT',sourceMeetingPointConfirmed:true,independentlyReviewed:true,selfWrittenSummary:true,noCopiedTextOrImages:true,noPrivateData:true,reviewRef:'self:synthetic-review'}},now)};
 const ask={requestId:randomUUID(),action:'ASK',text:'請代轉詢問面交時間',at:now.toISOString()};
 const consent={requestId:randomUUID(),action:'CONSENT',consent:true,payloadHash:digest({leadId:lead.id,contentHash:lead.contentHash,canonicalUrl:lead.canonicalUrl,questions:[{requestId:ask.requestId,text:ask.text}]}),at:new Date(now.getTime()+1).toISOString()};
 return {id:randomUUID(),leadId:lead.id,buyerUserId:1,state:'WAITING_ROUTE',leadContentHash:lead.contentHash,lead,events:[ask,consent] as any[]};
}
