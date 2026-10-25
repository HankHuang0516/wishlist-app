import fs from 'fs';
import os from 'os';
import path from 'path';
const {invoke}=require('../../scripts/retail-price-research.cjs');
test('uses only the fixed admin origin and a credential header, never a URL or request payload secret',async()=>{const fetcher=jest.fn(async()=>({ok:true,json:async()=>({items:[]})}));await invoke('candidates',['3'],{credential:'synthetic-only-key',fetcher});const [url,init]=fetcher.mock.calls[0] as any;expect(url).toBe('https://wishlist-app-production.up.railway.app/api/retail-price-admin/candidates?limit=3');expect(url).not.toContain('synthetic-only-key');expect(init.headers['X-Admin-Key']).toBe('synthetic-only-key');expect(init.redirect).toBe('error');});
test('records only explicit local evidence JSON and retains structured failure codes',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'retail-cli-test-'));try{const file=path.join(dir,'evidence.json');fs.writeFileSync(file,JSON.stringify({status:'NOT_FOUND',notes:'Synthetic original-price check'}));const fetcher=jest.fn(async()=>({ok:false,status:409,json:async()=>({errorCode:'RETAIL_REQUEST_CONFLICT',error:'do not expose this body'})}));await expect(invoke('record',[file],{credential:'synthetic-only-key',fetcher})).rejects.toThrow('RETAIL_HTTP_409_RETAIL_REQUEST_CONFLICT');const init=(fetcher.mock.calls[0] as any)[1];expect(init.body).not.toContain('synthetic-only-key');expect(JSON.parse(init.body).status).toBe('NOT_FOUND');}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('supports actual full-catalog coverage and explicitly scoped candidate reads',async()=>{const fetcher=jest.fn(async()=>({ok:true,json:async()=>({items:[]})}));await invoke('coverage',[],{credential:'synthetic-only-key',fetcher});expect((fetcher.mock.calls[0] as any)[0]).toContain('/coverage');await invoke('candidates',['6','listing'],{credential:'synthetic-only-key',fetcher});expect((fetcher.mock.calls[1] as any)[0]).toContain('limit=6&source=listing');});
test('looks up one bound public key and rejects malformed keys before network access',async()=>{
 const fetcher=jest.fn(async()=>({ok:true,json:async()=>({items:[]})}));
 const key='source:12345678-1234-4234-8234-123456789abc';
 await invoke('candidate',[key],{credential:'synthetic-only-key',fetcher});
 expect((fetcher.mock.calls[0] as any)[0]).toContain('limit=1&productKey='+encodeURIComponent(key));
 await expect(invoke('candidate',['private:invalid'],{credential:'synthetic-only-key',fetcher})).rejects.toThrow('RETAIL_INVALID_PRODUCT_KEY');
 expect(fetcher).toHaveBeenCalledTimes(1);
});
