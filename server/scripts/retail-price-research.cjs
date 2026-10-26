#!/usr/bin/env node
// Public original-new-price evidence only. Credentials are read at runtime and
// are never written to files, sent in URLs, or printed in errors.
const fs=require('node:fs');
async function invoke(command,args,{credential=process.env.ADMIN_API_KEY,fetcher=fetch}={}){
 if(typeof credential!=='string'||!credential.trim())throw Error('RETAIL_ADMIN_CREDENTIAL_REQUIRED');
 const base='https://wishlist-app-production.up.railway.app/api/retail-price-admin';let path,method='GET',body;
 if(command==='candidate'){if(args.length!==1||!/^(listing|source|external):[a-f0-9-]{36}$/.test(args[0]))throw Error('RETAIL_INVALID_PRODUCT_KEY');path='/candidates?limit=1&productKey='+encodeURIComponent(args[0]);}
 else if(command==='status'){if(!args.length||args.length>100||new Set(args).size!==args.length||args.some(k=>!/^(listing|source|external):[a-f0-9-]{36}$/.test(k)))throw Error('RETAIL_INVALID_PRODUCT_KEY');path='/evaluations?productKeys='+encodeURIComponent(args.join(','));}
 else if(command==='coverage'||command==='capacity'){if(args.length)throw Error('RETAIL_INVALID_QUERY');path='/'+command;}
 else if(command==='candidates'||command==='pending'){const n=Number(args[0]??(command==='candidates'?3:6));if(!Number.isInteger(n)||n<1||n>100)throw Error('RETAIL_INVALID_LIMIT');path='/'+(command==='pending'?'pending-evaluations':'candidates')+'?limit='+n;if(command==='candidates'&&args[1]){if(!['all','listing','source','external'].includes(args[1]))throw Error('RETAIL_INVALID_SOURCE');path+='&source='+args[1];}}
 else if(command==='record'||command==='evaluate'){if(args.length!==1)throw Error('RETAIL_JSON_FILE_REQUIRED');body=JSON.parse(fs.readFileSync(args[0],'utf8'));path=command==='record'?'/observations':'/evaluate';method='POST';}
 else throw Error('RETAIL_UNKNOWN_COMMAND');
 const r=await fetcher(base+path,{method,headers:{'X-Admin-Key':credential,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(command==='evaluate'?35000:30000)});const data=await r.json().catch(()=>null);if(!r.ok){const e=Error('RETAIL_HTTP_'+r.status+'_'+(typeof data?.errorCode==='string'?data.errorCode:'UNCONFIRMED'));e.httpStatus=r.status;e.rateLimitHeaders={};for(const name of ['retry-after','ratelimit-limit','ratelimit-remaining','ratelimit-reset','x-ratelimit-limit','x-ratelimit-remaining','x-ratelimit-reset']){const value=r.headers?.get?.(name);if(value!==null&&value!==undefined)e.rateLimitHeaders[name]=value;}throw e;}return data;
}
module.exports={invoke};
if(require.main===module)invoke(process.argv[2],process.argv.slice(3)).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{const error=e.message.startsWith('RETAIL_')?e.message:'RETAIL_OPERATION_UNCONFIRMED';if(Number.isInteger(e.httpStatus))console.log(JSON.stringify({error,httpStatus:e.httpStatus,headers:e.rateLimitHeaders??{},retried:false}));console.error(error);process.exitCode=1;});
