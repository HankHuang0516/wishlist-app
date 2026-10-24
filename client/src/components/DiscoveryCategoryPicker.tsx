import {useEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronRight,ArrowLeft,Search,X,Image as ImageIcon} from 'lucide-react';
import type {DiscoveryCategory} from '../lib/discovery';
import {getDisplayLocale} from '../utils/localization';
const say=(zh:string,en:string)=>getDisplayLocale().startsWith('zh')?zh:en;
const label=(c:{label:string;en:string})=>say(c.label,c.en);
type Recent={main:string;sub:string};
export default function DiscoveryCategoryPicker({categories,main,sub,onChange,storageKey}:{categories:DiscoveryCategory[];main:string;sub:string;onChange:(main:string,sub:string)=>void;storageKey:string}){
  const [open,setOpen]=useState(false),[preview,setPreview]=useState(main||'electronics'),[search,setSearch]=useState(''),[step,setStep]=useState(false),[recents,setRecents]=useState<Recent[]>([]);
  const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
  const hover=useRef<number|undefined>(undefined);
  function cancelHover(){window.clearTimeout(hover.current);hover.current=undefined;}
  function previewIntent(id:string){cancelHover();hover.current=window.setTimeout(()=>setPreview(id),180);}
  const parent=categories.find(c=>c.id===main),child=parent?.children.find(c=>c.id===sub),active=categories.find(c=>c.id===preview)??categories[0];
  useEffect(()=>{try{const v=JSON.parse(localStorage.getItem(storageKey)??'[]');setRecents(Array.isArray(v)?v.filter(x=>x&&typeof x.main==='string'&&typeof x.sub==='string').slice(0,4):[]);}catch{setRecents([]);}},[storageKey]);
  function close(){cancelHover();setOpen(false);setSearch('');setStep(false);trigger.current?.focus();}
  function choose(m:string,s:string){
    if(m){const next=[{main:m,sub:s},...recents.filter(x=>x.main!==m||x.sub!==s)].slice(0,4);setRecents(next);try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{/* Recents are optional; selection still works. */}}
    onChange(m,s);close();
  }
  useEffect(()=>{if(!open)return;panel.current?.querySelector<HTMLInputElement>('input')?.focus();},[open]);
  useEffect(()=>()=>cancelHover(),[]);
  useEffect(()=>{if(!open)return;const fit=()=>panel.current?.style.setProperty('--category-space',Math.max(100,window.innerHeight-(trigger.current?.getBoundingClientRect().bottom??0)-22)+'px');fit();window.addEventListener('resize',fit);return()=>window.removeEventListener('resize',fit);},[open]);
  const results=categories.flatMap(c=>[{main:c.id,sub:'',label:label(c),count:c.count,thumbnailUrl:null as string|null},...c.children.map(s=>({main:c.id,sub:s.id,label:label(c)+' › '+label(s),count:s.count,thumbnailUrl:s.thumbnailUrl}))]).filter(c=>c.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <div className="discovery-category">
    <button ref={trigger} type="button" className={'discovery-filter category-trigger '+(parent?'is-selected':'')} aria-expanded={open} aria-haspopup="dialog" onClick={()=>{setPreview(main||categories.find(c=>c.count>0)?.id||'electronics');setOpen(!open);setStep(false);}}>
      <span>{parent?label(parent)+(child?' › '+label(child):''):say('所有分類','All categories')}</span><ChevronDown size={15}/>
    </button>
    {parent&&<button className="category-clear" aria-label={say('清除分類','Clear category')} onClick={()=>choose('','')}><X size={13}/></button>}
    {open&&<><div className="category-scrim" onClick={close}/><div ref={panel} className="category-popover" role="dialog" aria-modal="true" aria-label={say('選擇商品分類','Choose product category')} onKeyDown={e=>{
      if(e.key==='Escape'){e.stopPropagation();close();}
      if(e.key==='Tab'){const controls=[...panel.current!.querySelectorAll<HTMLElement>('input,button,a[href]')].filter(x=>x.offsetParent!==null&&!x.hasAttribute('disabled'));const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    }}>
      <div className="category-mobile-title"><strong>{say('商品分類','Categories')}</strong><button aria-label={say('關閉分類','Close categories')} onClick={close}><X size={20}/></button></div>
      <label className="category-search"><Search size={19}/><input aria-label={say('搜尋分類','Search categories')} placeholder={say('搜尋分類，例如 螢幕','Search categories, e.g. monitors')} value={search} onChange={e=>setSearch(e.target.value)}/></label>
      {!search&&recents.length>0&&<div className="category-recents"><span>{say('最近使用','Recent')}</span>{recents.map(r=>{const c=categories.find(c=>c.id===r.main),s=c?.children.find(s=>s.id===r.sub);return c&&<button key={r.main+r.sub} onClick={()=>choose(r.main,r.sub)}>{s?label(s):label(c)}</button>;})}</div>}
      {search?<div className="category-results">{results.map(r=><button key={r.main+r.sub} onClick={()=>choose(r.main,r.sub)}><span>{r.label}</span>{r.count>0&&<small>{r.count}</small>}</button>)}{!results.length&&<p>{say('找不到分類，試試其他關鍵字。','No category matches. Try another word.')}</p>}</div>:<div className={'category-columns '+(step?'mobile-child':'')}>
        <div className="category-parents" aria-label={say('主分類','Main categories')} onKeyDown={e=>{if(!['ArrowDown','ArrowUp','ArrowRight'].includes(e.key))return;const controls=[...e.currentTarget.querySelectorAll('button')],index=controls.indexOf(document.activeElement as HTMLButtonElement);e.preventDefault();if(e.key==='ArrowRight'){setStep(true);panel.current?.querySelector<HTMLButtonElement>('.category-child-grid button')?.focus();}else controls[(index+(e.key==='ArrowDown'?1:-1)+controls.length)%controls.length]?.focus();}}><button onClick={()=>choose('','')}>{say('全部商品','All products')}</button>{categories.map(c=><button key={c.id} className={preview===c.id?'current':''} aria-current={preview===c.id?'true':undefined} onMouseEnter={()=>previewIntent(c.id)} onMouseLeave={cancelHover} onFocus={()=>{cancelHover();setPreview(c.id);}} onClick={()=>{cancelHover();setPreview(c.id);setStep(true);}}><span>{label(c)}</span><ChevronRight size={15}/></button>)}</div>
        {active&&<div className="category-children"><div className="category-child-heading"><button className="category-mobile-back" onClick={()=>setStep(false)}><ArrowLeft size={17}/>{say('返回','Back')}</button><strong>{label(active)}</strong><button onClick={()=>choose(active.id,'')}>{say('全部','All')} {label(active)} <ChevronRight size={13}/></button></div><div className="category-child-grid">{active.children.map(c=><button key={c.id} className={main===active.id&&sub===c.id?'selected':''} onClick={()=>choose(active.id,c.id)}>
          <span className="category-thumb">{c.thumbnailUrl?<img src={c.thumbnailUrl} alt="" loading="lazy"/>:<ImageIcon size={21} aria-hidden="true"/>}</span><span>{label(c)}{c.count>0&&<small>{c.count}</small>}</span>
        </button>)}</div><p className="category-inference">{say('分類依商品名稱整理；不確定的商品保留於「尚未細分類」。','Categories are derived from titles. Uncertain items remain unclassified.')}</p></div>}
      </div>}
    </div></>}
  </div>;
}
