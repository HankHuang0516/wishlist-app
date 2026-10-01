import {useRef,useState} from 'react';
import {API_URL} from '../config';
export default function PartnerInquiryPage(){
 const id=useRef(crypto.randomUUID());const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [receipt,setReceipt]=useState<{inquiryId:string;notificationStatus:string}|null>(null);
 return <section className="mx-auto max-w-3xl rounded-2xl bg-white p-6 space-y-5">
 <h1 className="text-3xl font-bold">提出合作意向</h1><p>先討論雙北 3–10 件在售二手商品。提交本表不構成商品、圖文或 AI 處理授權；取得逐件許可後才私人預檢與審核。</p>
 {receipt ? <div role="status"><h2>合作意向已保存</h2><p>收件編號：{receipt.inquiryId}</p><p>{receipt.notificationStatus==='ACCEPTED'?'通知已交付郵件服務，尚不代表收件匣送達。':'通知尚未確認，資料已保存供管理端追蹤。'}</p><p>我們會透過您提供的 Email 回覆；請保留此編號。</p></div> : <form className="space-y-4" onSubmit={async e=>{
 e.preventDefault();if(busy)return;const f=new FormData(e.currentTarget);setBusy(true);setError('');
 try{const res=await fetch(`${API_URL}/partner-inquiries`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientSubmissionId:id.current,organization:f.get('organization'),contactName:f.get('contactName'),contactEmail:f.get('contactEmail'),websiteUrl:f.get('websiteUrl'),categories:[f.get('category')],updateMethod:f.get('updateMethod'),sampleUrls:String(f.get('sampleUrls')||'').split(/\s+/).filter(Boolean),message:f.get('message'),contactConsent:f.get('contactConsent')==='on',companyFax:f.get('companyFax')})});const d=await res.json();if(!res.ok || !d.received || !d.inquiryId)throw new Error(d.error||'未能確認收件');setReceipt(d);}catch(err){setError((err instanceof Error?err.message:'未能確認收件')+'；請保留內容與識別碼 '+id.current+'，勿改內容重複提交。');}finally{setBusy(false);}
 }}>
 {([['organization','商家／來源名稱','text',120],['contactName','聯絡人','text',80],['contactEmail','回覆 Email','email',254],['websiteUrl','官方網站（選填 HTTPS）','url',500]] as const).map(([name,label,type,max])=><label key={name} className="block">{label}<input className="block w-full border rounded p-2" name={name} type={type} maxLength={max} minLength={name==='contactEmail'?5:2} required={name!=='websiteUrl'} disabled={busy}/></label>)}
 <label className="block">商品類別<select name="category" className="block border p-2" disabled={busy}>{[['FURNITURE','家具'],['BOOKS','書籍'],['ELECTRONICS','3C'],['CAMERA','相機'],['MUSIC','樂器'],['TOYS','玩具'],['FASHION','服飾精品'],['OTHER','其他']].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 <label className="block">售出／撤回更新方式<select name="updateMethod" className="block border p-2" disabled={busy}>{['MANUAL','CSV','API','OTHER'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label className="block">樣本商品 HTTPS 連結（選填，最多3個；以空白分隔）<textarea className="block w-full border p-2" name="sampleUrls" maxLength={1500} disabled={busy}/></label>
 <label className="block">合作說明、實際行政區／門市／取貨及更新方式<textarea className="block w-full border p-2" name="message" maxLength={1000} disabled={busy}/></label>
 <div hidden><label>Fax<input name="companyFax" autoComplete="off" tabIndex={-1}/></label></div>
 <label className="block"><input name="contactConsent" type="checkbox" required disabled={busy}/>同意 Wishlist.ai 為本次合作詢問保存資料並透過 Email 聯絡；不需提供密碼。</label>
 {error&&<p role="alert">{error}</p>}<button className="rounded bg-muji-primary text-white px-5 py-3" disabled={busy}>{busy?'保存中…':'送出合作意向'}</button>
 </form>}</section>;
}
