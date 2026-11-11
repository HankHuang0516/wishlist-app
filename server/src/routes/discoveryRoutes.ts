import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken, optionalAuthenticateToken, AuthRequest } from '../middleware/auth';
import { loadDiscovery, discoveryPage, discoveryQuery, DiscoveryError, recommendDiscovery, filterDiscovery, wishMatchGroups } from '../lib/discovery';
import {attachCp,evaluateCp,cpTargets} from '../lib/discoveryCp';
import {retailReferences} from '../lib/retailPrices';
import {catalogDiscoveryPage,catalogProduct,catalogReady} from '../lib/publicCatalog';
import {privateStorePreviewProducts} from '../lib/privateStorePreview';
import {warmThumbnails} from '../lib/mediaWarm';

async function withRetailReferences(products: Awaited<ReturnType<typeof loadDiscovery>>) {
  const references=await retailReferences(products);
  return products.map(p=>({...p,...(references.has(p.key)?{retail:references.get(p.key)}:{})}));
}

export function createDiscoveryRoutes() {
  const router=Router();
  router.use(rateLimit({windowMs:60_000,limit:90,standardHeaders:true,legacyHeaders:false,skip:(_q,r)=>r.locals.verifiedAccountRequest===true,message:{errorCode:'DISCOVERY_READ_RATE_LIMIT'}}));
  router.use((_q,r,n)=>{r.set('Cache-Control','private, no-store');n();});
  router.use(optionalAuthenticateToken);
  const read=async(req:AuthRequest,res:any)=>{
    try{
      const recommended=req.path==='/for-you',cp=req.path==='/cp',raw={...req.query};
      const wish=raw.wish;delete raw.wish;
      if(wish!==undefined&&(!recommended||typeof wish!=='string'||! /^[1-9]\d{0,9}$/.test(wish)||Number(wish)>2147483647))throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
      const query=discoveryQuery(raw);
      if(query.sort==='cp'&&!cp)throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
      const now=new Date(),map=query.presentation==='map';
      // The ordinary feed reads one page from the read model; a private preview keeps its own product list.
      const ordinary=!recommended&&!cp&&await privateStorePreviewProducts(req.user?.id,now,map)===null;
      if(ordinary&&await catalogReady(now)){
        const page=await catalogDiscoveryPage(query,now,true);
        void warmThumbnails(page.items.map(item=>item.thumbnailUrl));
        return res.json({...page,items:await withRetailReferences(page.items)});
      }
      // Reached by an ordinary read only when the read model has just declined: the full scan answers, without asking it again.
      let products=await loadDiscovery(now,map,req.user?.id,ordinary);
      if(recommended){ products=await recommendDiscovery(products,req.user!.id,wish===undefined?undefined:Number(wish));if(req.query.sort===undefined)query.sort='recommended'; }
      if(cp){
        const evaluated=await attachCp(products),scoped=discoveryPage(evaluated,{...query,cursor:'',limit:60}),scopeProducts=filterDiscovery(evaluated,query);
        const ready=evaluated.filter(p=>p.cp?.score!==null&&p.cp?.score!==undefined&&p.cp.score>=75&&p.cp.confidence==='MEDIUM');if(req.query.sort===undefined)query.sort='cp';
        const page=discoveryPage(ready,query);
        return res.json({...page,categories:scoped.categories,counties:scoped.counties,cpStatus:{evaluated:scopeProducts.filter(p=>p.cp).length,scored:scopeProducts.filter(p=>p.cp?.score!==null&&p.cp?.score!==undefined).length,pending:cpTargets(scopeProducts,new Set(scopeProducts.filter(p=>p.cp).map(p=>p.key))).length,providerConfigured:!!process.env.GEMINI_API_KEY,threshold:75,assessments:scopeProducts.filter(p=>p.cp).slice(0,12).map(p=>({key:p.key,title:p.title,score:p.cp!.score,reasons:p.cp!.reasons,evaluatedAt:p.cp!.evaluatedAt,retail:p.cp!.retail,conversion:p.cp!.conversion}))}});
      }
      const page=discoveryPage(await withRetailReferences(products),query);
      void warmThumbnails(page.items.map(item=>item.thumbnailUrl));
      return res.json(page);
    }catch(e){return res.status(e instanceof DiscoveryError?e.status:503).json({errorCode:e instanceof DiscoveryError?e.code:'DISCOVERY_UNAVAILABLE'});}
  };
  router.get('/for-you',authenticateToken,read);
  // Every open wish of the account with its best matches, for the home page: no wish has to be chosen first.
  router.get('/wish-matches',authenticateToken,async(req:AuthRequest,res)=>{
    try{
      if(Object.keys(req.query).length)throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
      return res.json(await wishMatchGroups(req.user!.id));
    }catch(e){return res.status(e instanceof DiscoveryError?e.status:503).json({errorCode:e instanceof DiscoveryError?e.code:'DISCOVERY_UNAVAILABLE'});}
  });
  router.get('/cp',read);
  // Recheck current public eligibility and the exact model binding, without running AI.
  router.get('/products/:kind/:id',async(req,res)=>{
    try {
      if(Object.keys(req.query).length||!['listing','source','external'].includes(req.params.kind)||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id))
        throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
      const key=req.params.kind+':'+req.params.id.toLowerCase(),now=new Date(),viewer=(req as AuthRequest).user?.id;
      const direct=await privateStorePreviewProducts(viewer,now,false)===null;
      const product=direct&&await catalogReady(now)?await catalogProduct(key,now,true):(await loadDiscovery(now,false,viewer,direct)).find(p=>p.key===key);
      if(!product)throw new DiscoveryError(404,'DISCOVERY_PRODUCT_UNAVAILABLE');
      return res.json(discoveryPage(await withRetailReferences([product]),discoveryQuery({})));
    } catch(e) {return res.status(e instanceof DiscoveryError?e.status:503).json({errorCode:e instanceof DiscoveryError?e.code:'DISCOVERY_UNAVAILABLE'});}
  });
  router.post('/cp-evaluations',authenticateToken,rateLimit({windowMs:10*60_000,limit:2,keyGenerator:(req:AuthRequest)=>'cp-owner-'+req.user!.id,standardHeaders:true,legacyHeaders:false,message:{errorCode:'CP_RATE_LIMIT'}}),async(req:AuthRequest,res)=>{
    try{
      if(Object.keys(req.query).length)throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
      const query=discoveryQuery(req.body),all=await loadDiscovery(new Date(),query.presentation==='map'),matching=filterDiscovery(all,query);
      return res.json(await evaluateCp(matching));
    }catch(e){return res.status(e instanceof DiscoveryError?e.status:503).json({errorCode:e instanceof DiscoveryError?e.code:'CP_EVALUATION_UNAVAILABLE'});}
  });
  router.get('/',read);
  return router;
}
