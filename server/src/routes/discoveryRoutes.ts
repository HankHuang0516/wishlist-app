import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { loadDiscovery, discoveryPage, discoveryQuery, DiscoveryError, recommendDiscovery, filterDiscovery } from '../lib/discovery';
import {attachCp,evaluateCp,cpTargets} from '../lib/discoveryCp';

export function createDiscoveryRoutes() {
  const router=Router();
  router.use(rateLimit({windowMs:60_000,limit:90,standardHeaders:true,legacyHeaders:false,skip:(_q,r)=>r.locals.verifiedAccountRequest===true,message:{errorCode:'DISCOVERY_READ_RATE_LIMIT'}}));
  router.use((_q,r,n)=>{r.set('Cache-Control','private, no-store');n();});
  const read=async(req:AuthRequest,res:any)=>{
    try{
      const query=discoveryQuery(req.query), recommended=req.path==='/for-you',cp=req.path==='/cp';
      if(query.sort==='cp'&&!cp)throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
      let products=await loadDiscovery();
      if(recommended){ products=await recommendDiscovery(products,req.user!.id);if(req.query.sort===undefined)query.sort='recommended'; }
      if(cp){
        const evaluated=await attachCp(products),scoped=discoveryPage(evaluated,{...query,cursor:'',limit:60}),scopeProducts=filterDiscovery(evaluated,query);
        const ready=evaluated.filter(p=>p.cp?.score!==null&&p.cp?.score!==undefined&&p.cp.score>=75&&p.cp.confidence==='MEDIUM');if(req.query.sort===undefined)query.sort='cp';
        const page=discoveryPage(ready,query);
        return res.json({...page,categories:scoped.categories,counties:scoped.counties,cpStatus:{evaluated:scopeProducts.filter(p=>p.cp).length,scored:scopeProducts.filter(p=>p.cp?.score!==null&&p.cp?.score!==undefined).length,pending:cpTargets(scopeProducts,new Set(scopeProducts.filter(p=>p.cp).map(p=>p.key))).length,providerConfigured:!!process.env.GEMINI_API_KEY,threshold:75,assessments:scopeProducts.filter(p=>p.cp).slice(0,12).map(p=>({key:p.key,title:p.title,score:p.cp!.score,reasons:p.cp!.reasons,evaluatedAt:p.cp!.evaluatedAt}))}});
      }
      return res.json(discoveryPage(products,query));
    }catch(e){return res.status(e instanceof DiscoveryError?e.status:503).json({errorCode:e instanceof DiscoveryError?e.code:'DISCOVERY_UNAVAILABLE'});}
  };
  router.get('/for-you',authenticateToken,read);
  router.get('/cp',read);
  router.post('/cp-evaluations',authenticateToken,rateLimit({windowMs:10*60_000,limit:2,keyGenerator:(req:AuthRequest)=>'cp-owner-'+req.user!.id,standardHeaders:true,legacyHeaders:false,message:{errorCode:'CP_RATE_LIMIT'}}),async(req:AuthRequest,res)=>{
    try{
      if(Object.keys(req.query).length)throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
      const query=discoveryQuery(req.body),all=await loadDiscovery(),matching=filterDiscovery(all,query);
      return res.json(await evaluateCp(matching));
    }catch(e){return res.status(e instanceof DiscoveryError?e.status:503).json({errorCode:e instanceof DiscoveryError?e.code:'CP_EVALUATION_UNAVAILABLE'});}
  });
  router.get('/',read);
  return router;
}
