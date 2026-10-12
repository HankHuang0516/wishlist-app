import {ExploreEvidence,type SourceKind} from '../lib/exploreEvidence';
import {getDisplayLocale} from '../utils/localization';
export function ExploreEvidencePanel({evidence,visible}:{evidence:ExploreEvidence;visible:Record<SourceKind,string[]>}){
 const zh=getDisplayLocale().startsWith('zh'),t=(a:string,b:string)=>zh?a:b;
 const receipt=evidence.snapshot(visible);
 const phases:Record<string,string>=zh?{pending:'讀取中',partial:'尚未讀完／上限',complete:'已讀至終頁',disabled:'API回報未開放',fallback404:'路由404相容退回',skipped:'條件不支援，未查詢',error:'讀取／驗證失敗',cancelled:'已取消'}:{pending:'Reading',partial:'Incomplete / capped',complete:'Terminal page read',disabled:'API disabled',fallback404:'404 compatibility fallback',skipped:'Unsupported filters, skipped',error:'Read / validation failed',cancelled:'Cancelled'};
 function download(){const body=JSON.stringify(evidence.snapshot(visible),null,2),url=URL.createObjectURL(new Blob([body],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='explore-query-'+evidence.query.serial+'.json';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <details className="rounded-xl border bg-white p-4" data-testid="explore-query-evidence"><summary className="min-h-11 cursor-pointer font-semibold">{t('查詢證據','Query evidence')}</summary>
 <p className="break-words">{t('本次查詢','Query')} #{receipt.query.serial} · {receipt.startedAt} · bbox {receipt.query.bbox.join(',')}</p>
 <p>{receipt.comparable?t('三來源已讀至終頁；這是公開查詢紀錄，非合格在售商品數。','All three sources reached terminal pages; public records, not verified stock.'):t('未建立三來源完整基準；未開放、失敗或未完成不能當成功0。','No complete three-source baseline; disabled, failed or incomplete is not a successful zero.')}</p>
 <p>{t('逐件權利及目前在售未由搜尋驗證；合格供應數未知。跨頁非原子快照，來源自動更新會另標讀取輪次。','Item rights and current stock are unverified; qualified supply is unknown. Pagination is not atomic; source refresh cycles are recorded.')}</p>
 <ul>{(['seller','external','source'] as const).map(k=>{const l=evidence.layers[k];return <li key={k}>{k==='seller'?t('站內商品','On-site'):k==='external'?t('外部商品','External'):t('來源線索','Source references')}：{phases[l.phase]} · {l.pages.length} {t('頁','pages')} · {t('可見','Visible')} {visible[k].length} · {t('過濾','Filtered')} {l.ids.filter(id=>!visible[k].includes(id)).length}</li>;})}</ul>
 <button type="button" onClick={download} className="mt-3 min-h-11 rounded-xl border px-4">{t('匯出本次查詢 JSON','Export query JSON')}</button>
 <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(receipt,null,2)}</pre></details>;
}
