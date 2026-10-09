import { Base, ImportError, PendingItem, sha, validateBase } from './semiAutoImport';
import { digest, ref } from './sourceLeadPrimitives';

export const CANONICAL_CSV_COLUMNS = ["序號","商品ID","商品名稱","價格下限","價格上限","幣別","幣別確認","新舊分類","原文新舊","公開地區","庫存","交易類型","價格類型","價格單位","条件價格","運費狀態","總交易金額","來源社團","來源貼文","原歸檔查閱時間UTC","原發文時間證據","日期門檻","日期查證時間UTC","地址門檻","公開地点名稱","已核公共地址","地址來源","刊登同意","可公開上架","可直接結帳","買家條件接受","賣家交易條件主張","備註","座標門檻","公共地點ID","緯度","經度","座標來源","座標查證時間UTC","座標系統","座標定位方法","位置精度公尺","地點提醒","計價單位證據","僅供參考的單位推定","新舊分類依據","來源書況與功能主張","商品價數來源核對","內容再查閱時間UTC","source_region_estimate","本輪查核日台北","本輪來源查核","本輪來源查核時間UTC","本輪狀態摘要","候選分類"];
export type Artifact = { libraryFileId:string; version:number; bytes:string };
export type Pair = { json:Artifact; csv:Artifact };
export type ReadOnlyCanonicalReader = {
    metadata:(id:string)=>Promise<{libraryFileId:string;version:number}>;
    bytes:(id:string,version:number)=>Promise<string>;
};
export type Decision = { pendingId:string; contentHash:string; archiveItemId:string; previousItemHash:string|null; reviewRef:string };

// Generic CSV table parser preserves the actual 55-column schema. Do not treat
// Library's rendered-sheet artificial "index" column as a raw CSV column.
export function csvTable(text:string):string[][] {
    if(Buffer.byteLength(text)>32*1024*1024)throw new ImportError('CANONICAL_SIZE_LIMIT');
    const rows:string[][]=[];let row:string[]=[],value='',quoted=false,closed=false;text=text.replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;}
        else if(c==='"'){if(value||closed)throw new ImportError('CANONICAL_CSV_INVALID');quoted=true;}
        else if(c===','||c==='\n'||c==='\r'){row.push(value);value='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;rows.push(row);row=[];if(rows.length>20001)throw new ImportError('CANONICAL_ROW_LIMIT');}}
        else{if(closed)throw new ImportError('CANONICAL_CSV_INVALID');value+=c;}}
    if(quoted)throw new ImportError('CANONICAL_CSV_INVALID');if(value||row.length||closed){row.push(value);rows.push(row);}return rows;
}
const idValid=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(v);
const csvSafe=(s:string)=>/^[=+\-@\t\r]/.test(s)?"'"+s:s;
// Existing cells are opaque historical data: quoting may change, their values do
// not. Apply spreadsheet protection only to newly supplied free-form names.
const csvCell=(v:unknown)=>'"'+(v===null||v===undefined?'':String(v)).replace(/"/g,'""')+'"';
export const serializeTable=(rows:unknown[][])=>rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
export function checkPair(base:Base,pair:Pair){validateBase(base);
    if(pair.json.libraryFileId!==base.libraryFileId||pair.csv.libraryFileId!==base.csvLibraryFileId||pair.json.version!==base.jsonVersion||pair.csv.version!==base.csvVersion)throw new ImportError('CANONICAL_VERSION_CONFLICT');
    if(sha(pair.json.bytes)!==base.sha256||sha(pair.csv.bytes)!==base.csvSha256)throw new ImportError('CANONICAL_BYTES_CONFLICT');
    if(Buffer.byteLength(pair.json.bytes)>32*1024*1024)throw new ImportError('CANONICAL_SIZE_LIMIT');
    const document=JSON.parse(pair.json.bytes),table=csvTable(pair.csv.bytes),header=table.shift()??[];
    if(header.length!==55||new Set(header).size!==55||CANONICAL_CSV_COLUMNS.some(c=>!header.includes(c)))throw new ImportError('CANONICAL_55_COLUMNS_REQUIRED');
    if(!document||!Array.isArray(document.items)||document.items.length>20000||document.items.some((r:any)=>!r||!idValid(r.id)))throw new ImportError('CANONICAL_ITEMS_REQUIRED');
    const items=new Map<string,any>(document.items.map((r:any)=>[r.id,r])),idColumn=header.indexOf('商品ID');
    if(items.size!==document.items.length||table.some(r=>r.length!==55||!items.has(r[idColumn]))||new Set(table.map(r=>r[idColumn])).size!==table.length||table.length!==items.size)throw new ImportError('CANONICAL_ID_SET_CONFLICT');
    // Cross-check every known shared core field, not just viewport/count equality.
    for(const row of table){const item=items.get(row[idColumn]);for(const [column,key] of [['商品名稱','name'],['來源貼文','source_post_url'],['價格下限','price_min'],['價格上限','price_max'],['幣別','currency']] as const){const idx=header.indexOf(column),expected=String(item[key]??'');if(idx>=0&&row[idx]!==expected&&!(key==='name'&&row[idx]===csvSafe(expected)))throw new ImportError('CANONICAL_FIELD_CONFLICT');}}
    for(const row of table){const item=items.get(row[idColumn]);for(const [column,key] of [['可公開上架','public_listing_eligible'],['可直接結帳','safe_to_checkout']] as const)if(typeof item[key]==='boolean'&&row[header.indexOf(column)].toLowerCase()!==String(item[key]))throw new ImportError('CANONICAL_QUALITY_STATE_CONFLICT');
        if(item.stock_status==='unknown'&&!['未知','unknown'].includes(row[header.indexOf('庫存')].toLowerCase()))throw new ImportError('CANONICAL_QUALITY_STATE_CONFLICT');
        if(item.seller_permission==='not_requested'&&!['未取得','not_requested'].includes(row[header.indexOf('刊登同意')]))throw new ImportError('CANONICAL_QUALITY_STATE_CONFLICT');
        if(row[header.indexOf('原歸檔查閱時間UTC')]!==String(item.checked_at??''))throw new ImportError('CANONICAL_SOURCE_TIME_CONFLICT');
        if(row[header.indexOf('本輪來源查核時間UTC')]!==String(item.current_source_check?.checked_at_utc??''))throw new ImportError('CANONICAL_SOURCE_TIME_CONFLICT');
    }
    return {document,header,rows:table,items};
}

// Adapter for the EXISTING single writer's lawful read channel. No credentials,
// transfers, new writer or Library mutation is implemented here.
export async function readPairFresh(base:Base,reader:ReadOnlyCanonicalReader):Promise<Pair>{validateBase(base);
    const ids=[base.libraryFileId,base.csvLibraryFileId],versions=[base.jsonVersion,base.csvVersion];
    const before=await Promise.all(ids.map(id=>reader.metadata(id)));for(let i=0;i<2;i++)if(before[i].libraryFileId!==ids[i]||before[i].version!==versions[i])throw new ImportError('CANONICAL_VERSION_CONFLICT');
    const bytes=await Promise.all(ids.map((id,i)=>reader.bytes(id,versions[i])));
    const after=await Promise.all(ids.map(id=>reader.metadata(id)));for(let i=0;i<2;i++)if(after[i].libraryFileId!==ids[i]||after[i].version!==versions[i])throw new ImportError('CANONICAL_READ_RACE');
    const pair={json:{...before[0],bytes:bytes[0]},csv:{...before[1],bytes:bytes[1]}};checkPair(base,pair);return pair;
}
export async function readObservedPair(base:Base,reader:ReadOnlyCanonicalReader):Promise<Pair>{validateBase(base);const ids=[base.libraryFileId,base.csvLibraryFileId],before=await Promise.all(ids.map(id=>reader.metadata(id)));
    for(let i=0;i<2;i++)if(before[i].libraryFileId!==ids[i]||!Number.isSafeInteger(before[i].version)||before[i].version<0)throw new ImportError('OBSERVED_PAIR_METADATA_INVALID');
    const bytes=await Promise.all(ids.map((id,i)=>reader.bytes(id,before[i].version))),after=await Promise.all(ids.map(id=>reader.metadata(id)));
    for(let i=0;i<2;i++)if(after[i].libraryFileId!==ids[i]||after[i].version!==before[i].version)throw new ImportError('CANONICAL_READ_RACE');
    // A partial write intentionally has unlike versions/content. Return truthful
    // bytes for reconcilePair; do not force them through a coherent-pair check.
    return {json:{...before[0],bytes:bytes[0]},csv:{...before[1],bytes:bytes[1]}};
}

const unknownNewRow=(p:PendingItem,id:string,sequence:number)=>({id,sequence,name:p.title,price:p.price,price_min:p.price,price_max:p.price,currency:p.currency??'',currency_confirmation_status:'UNKNOWN',condition_category:'UNKNOWN',source_condition_claim:'UNKNOWN',district:p.county&&p.district?p.county+p.district:'UNKNOWN',source_post_url:p.sourceUrl,group_id:/\/groups\/(\d+)/.exec(p.sourceUrl)?.[1]??null,
    stock_status:'unknown',seller_permission:'not_requested',public_listing_eligible:false,safe_to_checkout:false,review_status:'private_pending_manual_fact_review',checked_at:null,source_rechecked_at:null,
    date_gate:{status:'unknown',evidence:p.originalPostedAt?'人工提供待核：'+p.originalPostedAt:'UNKNOWN',independent_review_checked_at:null},address_gate:{status:'unknown',public_address:null},coordinate_gate:{status:'unknown',latitude:null,longitude:null},
    current_source_check:{status:'NOT_PERFORMED',checked_at_utc:null,price_currently_verified:false,stock_confirmed:false},archive_classification:'private_pending_unverified',semi_auto_import_fact_claim:{...p}});
const csvProjection=(r:any):Record<string,unknown>=>({
    '序號':r.sequence,'商品ID':r.id,'商品名稱':csvSafe(r.name),'價格下限':r.price_min,'價格上限':r.price_max,'幣別':r.currency,'幣別確認':r.currency_confirmation_status??'UNKNOWN',
    '新舊分類':r.condition_category??'UNKNOWN','原文新舊':r.source_condition_claim??'UNKNOWN','公開地區':r.district??'UNKNOWN','庫存':'未知','交易類型':r.transaction_type??'UNKNOWN','價格類型':r.price_type??'UNKNOWN','價格單位':r.price_unit??'UNKNOWN','条件價格':'UNKNOWN','運費狀態':r.shipping_fee_status??'UNKNOWN','總交易金額':r.transaction_total_status??'UNKNOWN',
    '來源社團':r.group_id,'來源貼文':r.source_post_url,'原歸檔查閱時間UTC':r.checked_at,'原發文時間證據':r.date_gate?.evidence??'UNKNOWN','日期門檻':r.date_gate?.status??'unknown','日期查證時間UTC':r.date_gate?.independent_review_checked_at,
    '地址門檻':r.address_gate?.status??'unknown','公開地点名稱':null,'已核公共地址':r.address_gate?.public_address,'地址來源':null,'刊登同意':'未取得','可公開上架':'false','可直接結帳':'false','買家條件接受':'未確認','賣家交易條件主張':'未核實','備註':'人工提供必要事實；私人待審，不代表授權或現貨。',
    '座標門檻':r.coordinate_gate?.status??'unknown','公共地點ID':null,'緯度':null,'經度':null,'座標來源':null,'座標查證時間UTC':null,'座標系統':'UNKNOWN','座標定位方法':'UNKNOWN','位置精度公尺':null,'地點提醒':'所在地／面交待核，不補座標。',
    '計價單位證據':'UNKNOWN','僅供參考的單位推定':'UNKNOWN','新舊分類依據':'UNKNOWN','來源書況與功能主張':'UNKNOWN','商品價數來源核對':'MANUAL_PROVIDED_UNVERIFIED','內容再查閱時間UTC':null,'source_region_estimate':null,
    '本輪查核日台北':null,'本輪來源查核':'NOT_PERFORMED','本輪來源查核時間UTC':null,'本輪狀態摘要':'人工提供；未執行來源查核。','候選分類':'private_pending_unverified'
});
export type Increment = {schemaVersion:1;operationId:string;base:Base;pendingSha256:string;decisions:Decision[];changes:any[];json:string;csv:string;after:{jsonSha256:string;csvSha256:string};receipt:any};

export function prepareMotherIncrement(pendingBytes:string,pendingManifest:{jsonSha256:string;base:Base;revision:number},pair:Pair,decisions:Decision[]):Increment {
    if(sha(pendingBytes)!==pendingManifest.jsonSha256)throw new ImportError('PENDING_HASH_CONFLICT');const pending=JSON.parse(pendingBytes),base=pendingManifest.base;
    if(digest(pending.base)!==digest(base)||pending.qualifiedSupplyAdded!==0||pending.requiresHumanReview!==true||!Array.isArray(pending.items)||!Array.isArray(decisions)||!decisions.length||decisions.length>500)throw new ImportError('REVIEWED_PENDING_REQUIRED');
    const before=checkPair(base,pair),byId=new Map<string,PendingItem&{reviewAction:string;reviewRef:string}>(pending.items.map((r:any)=>[r.id,r]));
    if(new Set(decisions.map(d=>d.pendingId)).size!==decisions.length||new Set(decisions.map(d=>d.archiveItemId)).size!==decisions.length)throw new ImportError('DUPLICATE_DECISION');
    for(const d of decisions){const p=byId.get(d.pendingId);if(!p||Object.keys(d).sort().join(',')!=='archiveItemId,contentHash,pendingId,previousItemHash,reviewRef'||!idValid(d.archiveItemId)||!ref(d.reviewRef)||p.reviewAction!=='KEEP_PENDING'||p.reviewRef!==d.reviewRef||p.contentHash!==d.contentHash||p.state!=='PENDING_REVIEW'||p.public!==false||p.issues.includes('STABLE_ITEM_KEY_REQUIRED'))throw new ImportError('BOUND_INCREMENT_REVIEW_REQUIRED');
        const facts={sourceUrl:p.sourceUrl,itemKey:p.itemKey,title:p.title,price:p.price,currency:p.currency,county:p.county,district:p.district,originalPostedAt:p.originalPostedAt,checkedAt:p.checkedAt,sourceStatus:p.sourceStatus,rights:p.rights,rightsRef:p.rightsRef};if(sha(JSON.stringify(facts))!==p.contentHash||p.id!=='pending-'+sha(p.sourceUrl+'\0'+p.itemKey))throw new ImportError('PENDING_FACTS_CONFLICT');}
    const operationId=digest({pendingSha256:pendingManifest.jsonSha256,decisions}),document=JSON.parse(pair.json.bytes),header=before.header,rows=before.rows.map(r=>[...r]),changes:any[]=[];
    const previousBatch=(document.semi_auto_import_batches??[]).find((r:any)=>r.operationId===operationId);
    if(previousBatch){if(previousBatch.pendingSha256!==pendingManifest.jsonSha256||digest(previousBatch.decisions)!==digest(decisions))throw new ImportError('DUPLICATE_OPERATION_CONFLICT');return {schemaVersion:1,operationId,base,pendingSha256:pendingManifest.jsonSha256,decisions,changes:[],json:pair.json.bytes,csv:pair.csv.bytes,after:{jsonSha256:sha(pair.json.bytes),csvSha256:sha(pair.csv.bytes)},receipt:{state:'ALREADY_MERGED_NO_CHANGE',canonicalWrites:0,qualifiedSupplyAdded:0}};}
    const indices=new Map<string,number>(document.items.map((r:any,i:number)=>[r.id,i]));
    for(const d of decisions){const p=byId.get(d.pendingId)!,index=indices.get(d.archiveItemId),old=index===undefined?null:document.items[index];
        if((old?digest(old):null)!==d.previousItemHash)throw new ImportError('ITEM_VERSION_CONFLICT');
        if(old&&(old.source_post_url!==p.sourceUrl||old.public_listing_eligible===true||old.safe_to_checkout===true))throw new ImportError('EXISTING_ITEM_REVIEW_REQUIRED');
        if(old?.semi_auto_import_fact_claim?.id===p.id&&old.semi_auto_import_fact_claim.contentHash===p.contentHash)continue;
        // Never guess a same-post identity from name/price. Existing row requires
        // explicit reviewer ID+before-hash binding; new row retains pending key.
        if(!old&&document.items.some((r:any)=>r.source_post_url===p.sourceUrl&&r.semi_auto_import_fact_claim?.itemKey===p.itemKey))throw new ImportError('DUPLICATE_SOURCE_ITEM');
        const proposed=old?{...old,name:p.title,...(p.price!==null?{price:p.price,price_min:p.price,price_max:p.price}:{}),...(p.currency?{currency:p.currency}:{}),semi_auto_import_fact_claim:{...p}}:unknownNewRow(p,d.archiveItemId,document.items.length+1);
        const factsChanged=!!old&&(old.name!==p.title||(p.price!==null&&(old.price_min!==p.price||old.price_max!==p.price))||(p.currency!==null&&old.currency!==p.currency));
        const priceChanged=!!old&&p.price!==null&&(old.price_min!==p.price||old.price_max!==p.price),currencyChanged=!!old&&p.currency!==null&&old.currency!==p.currency;
        if(priceChanged){proposed.price_unit_evidence_status='UNKNOWN_AFTER_MANUAL_PRICE_CHANGE';proposed.transaction_total_status='UNKNOWN';}
        if(currencyChanged){proposed.currency_confirmation_status='UNKNOWN';proposed.currency_basis='MANUAL_PROVIDED_UNVERIFIED';}
        if(factsChanged){proposed.current_source_check_history=[...(old.current_source_check_history??[]),...(old.current_source_check?[old.current_source_check]:[])];proposed.current_source_check={...(old.current_source_check??{}),status:'STALE_AFTER_MANUAL_FACT_CHANGE',checked_at_utc:old.current_source_check?.checked_at_utc??null,price_currently_verified:false,stock_confirmed:false,reason:'人工事實改動，舊查核不涵蓋新內容；未重新查來源。'};proposed.independent_content_reviewed=false;proposed.independent_content_sample_reviewed=false;proposed.review_status='private_pending_manual_fact_review';proposed.archive_classification='private_pending_unverified';}
        const audit={operationId,pendingId:p.id,pendingContentHash:p.contentHash,reviewRef:d.reviewRef,previousItemHash:d.previousItemHash,previousFacts:old?Object.fromEntries(['name','price','price_min','price_max','currency','district'].map(k=>[k,old[k]??null])):null,previousReviewState:old?Object.fromEntries(['review_status','archive_classification','independent_content_reviewed','price_unit_evidence_status','transaction_total_status','currency_confirmation_status','currency_basis'].map(k=>[k,old[k]??null])):null,originalPostedAtClaim:p.originalPostedAt,sourceCheckedAtClaim:p.checkedAt,sourceStatusClaim:p.sourceStatus,independentSourceCheckPerformed:false,rightsPromoted:false,stockPromoted:false};
        proposed.semi_auto_import_history=[...(old?.semi_auto_import_history??[]),audit];
        const projection=csvProjection(proposed),csvIndex=rows.findIndex(r=>r[header.indexOf('商品ID')]===d.archiveItemId);
        const row=old?[...rows[csvIndex]]:header.map(c=>String(projection[c]??''));
        if(old)for(const c of ['商品名稱','價格下限','價格上限','幣別'])row[header.indexOf(c)]=String(projection[c]??'');
        if(factsChanged){row[header.indexOf('本輪來源查核')]='STALE_AFTER_MANUAL_FACT_CHANGE';row[header.indexOf('本輪狀態摘要')]=proposed.current_source_check.reason;row[header.indexOf('候選分類')]='private_pending_unverified';}
        if(priceChanged){row[header.indexOf('計價單位證據')]='UNKNOWN_AFTER_MANUAL_PRICE_CHANGE';row[header.indexOf('總交易金額')]='UNKNOWN';}
        if(currencyChanged)row[header.indexOf('幣別確認')]='UNKNOWN';
        if(index===undefined){document.items.push(proposed);indices.set(proposed.id,document.items.length-1);rows.push(row);}else{document.items[index]=proposed;rows[csvIndex]=row;}
        changes.push({archiveItemId:d.archiveItemId,pendingId:p.id,previousItemHash:d.previousItemHash,afterItemHash:digest(proposed),action:old?'UPDATE_PRIVATE_FACTS':'ADD_PRIVATE_CANDIDATE',changedFields:old?['name',...(p.price!==null?['price','price_min','price_max']:[]),...(p.currency?['currency']:[]),...(priceChanged?['price_unit_evidence_status','transaction_total_status']:[]),...(currencyChanged?['currency_confirmation_status','currency_basis']:[]),...(factsChanged?['current_source_check_history','current_source_check','independent_content_reviewed','independent_content_sample_reviewed','review_status','archive_classification']:[]),'semi_auto_import_fact_claim','semi_auto_import_history']:Object.keys(proposed),jsonItem:proposed,csvRow:row});
    }
    if(!changes.length)return {schemaVersion:1,operationId,base,pendingSha256:pendingManifest.jsonSha256,decisions,changes:[],json:pair.json.bytes,csv:pair.csv.bytes,after:{jsonSha256:base.sha256,csvSha256:base.csvSha256},receipt:{state:'IDENTICAL_FACTS_NO_CHANGE',changedCount:0,canonicalWrites:0,qualifiedSupplyAdded:0,sourceChecks:0}};
    document.semi_auto_import_batches=[...(document.semi_auto_import_batches??[]),{operationId,pendingSha256:pendingManifest.jsonSha256,decisions,changedIds:changes.map(r=>r.archiveItemId),qualifiedSupplyAdded:0}];
    if(document.summary&&typeof document.summary==='object')document.summary.total_archived_items=document.items.length;
    document.semi_auto_import_snapshot={storedItemCount:document.items.length,changedIds:changes.map(r=>r.archiveItemId),previousValidationAndQualitySummaryRemainHistorical:true,independentSourceChecks:0,qualifiedSupplyAdded:0};
    const json=JSON.stringify(document,null,2)+'\n',csv=serializeTable([header,...rows]),after={jsonSha256:sha(json),csvSha256:sha(csv)};
    const result:Increment={schemaVersion:1,operationId,base,pendingSha256:pendingManifest.jsonSha256,decisions,changes,json,csv,after,receipt:{state:'PREPARED_FOR_EXISTING_SINGLE_WRITER',operationId,before:{jsonSha256:base.sha256,csvSha256:base.csvSha256},after,pendingRevision:pendingManifest.revision,changedCount:changes.length,itemCount:document.items.length,canonicalWrites:0,qualifiedSupplyAdded:0,sourceChecks:0,requiresCurrentPairReadback:true}};
    checkPair({...base,sha256:after.jsonSha256,csvSha256:after.csvSha256},{json:{...pair.json,bytes:json},csv:{...pair.csv,bytes:csv}});return result;
}

// Read-only state reconciliation after the existing writer's acknowledged writes.
// Partial/unknown results do NOT authorize a retry or rollback; return exact next
// prerequisite so the caller can resume its SAME recorded operation safely.
export function reconcilePair(increment:Increment,observed:Pair){const states=(['json','csv'] as const).map(kind=>{const a=observed[kind],id=kind==='json'?increment.base.libraryFileId:increment.base.csvLibraryFileId,v=kind==='json'?increment.base.jsonVersion:increment.base.csvVersion,before=kind==='json'?increment.base.sha256:increment.base.csvSha256,after=kind==='json'?increment.after.jsonSha256:increment.after.csvSha256;
    if(a.libraryFileId!==id)return 'CONFLICT';if(a.version===v&&sha(a.bytes)===before)return 'BEFORE';if(a.version===v+1&&sha(a.bytes)===after)return 'AFTER';return 'CONFLICT';});
    return {operationId:increment.operationId,jsonState:states[0],csvState:states[1],state:states.includes('CONFLICT')?'STOP_CONFLICT':states.every(s=>s==='AFTER')?'COMPLETE':states.every(s=>s==='BEFORE')?'NOT_APPLIED':'PARTIAL_REQUIRES_RECONCILIATION',retryAutomatically:false,rollbackAutomatically:false};
}
export function repeatIncrementStatus(increment:Increment,observed:Pair){
    if(observed.json.version<increment.base.jsonVersion+1||observed.csv.version<increment.base.csvVersion+1)throw new ImportError('REPEAT_PAIR_INCOMPLETE');
    const base={...increment.base,jsonVersion:observed.json.version,csvVersion:observed.csv.version,sha256:sha(observed.json.bytes),csvSha256:sha(observed.csv.bytes)},checked=checkPair(base,observed);
    const batch=(checked.document.semi_auto_import_batches??[]).find((r:any)=>r.operationId===increment.operationId);
    if(!batch||batch.pendingSha256!==increment.pendingSha256||digest(batch.decisions)!==digest(increment.decisions)||increment.changes.some(c=>digest(checked.items.get(c.archiveItemId))!==c.afterItemHash))throw new ImportError('REPEAT_OPERATION_CONFLICT');
    return {state:'ALREADY_MERGED_NO_CHANGE',operationId:increment.operationId,changedCount:0,canonicalWrites:0,sourceChecks:0,qualifiedSupplyAdded:0};
}
export function restoredBase(increment:Increment,observed:Pair):Base {if(observed.json.libraryFileId!==increment.base.libraryFileId||observed.csv.libraryFileId!==increment.base.csvLibraryFileId||observed.json.version<increment.base.jsonVersion||observed.csv.version<increment.base.csvVersion||sha(observed.json.bytes)!==increment.base.sha256||sha(observed.csv.bytes)!==increment.base.csvSha256)throw new ImportError('RESTORED_PAIR_NOT_VERIFIED');const base={...increment.base,jsonVersion:observed.json.version,csvVersion:observed.csv.version};checkPair(base,observed);return base;}
