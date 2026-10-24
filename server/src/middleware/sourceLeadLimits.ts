import type {Request} from 'express';
import rateLimit from 'express-rate-limit';

// A gallery's public images must not exhaust search/inquiry admission.
// Both independent budgets retain the original 120 requests/IP/minute limit.
const isMedia = (req:Request) => req.method === 'GET' && /^\/[a-f0-9-]{36}\/media\/[a-f0-9-]{36}\/(?:image|thumbnail)\/?$/i.test(req.path);
export function sourceLeadLimits() {
  return [
    rateLimit({windowMs:60_000,limit:120,skip:isMedia,standardHeaders:true,legacyHeaders:false}),
    rateLimit({windowMs:60_000,limit:120,skip:req=>!isMedia(req),standardHeaders:true,legacyHeaders:false}),
  ];
}
