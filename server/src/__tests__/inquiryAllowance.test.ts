import {inquiryWeek,legacyPremium} from '../lib/inquiryAllowance';
import {accountBinding,purchaseReference,sealReceipt,openReceipt} from '../lib/storeVerification';
test('Taiwan Monday reset handles UTC Sunday boundary, year rollover and exact instants',()=>{
 for(const [now,start,end] of [
  ['2026-10-25T15:59:59.999Z','2026-10-18T16:00:00.000Z','2026-10-25T16:00:00.000Z'],
  ['2026-10-25T16:00:00.000Z','2026-10-25T16:00:00.000Z','2026-11-01T16:00:00.000Z'],
  ['2027-01-01T10:00:00.000Z','2026-12-27T16:00:00.000Z','2027-01-03T16:00:00.000Z']
 ]){const w=inquiryWeek(new Date(now));expect(w.startsAt.toISOString()).toBe(start);expect(w.resetsAt.toISOString()).toBe(end);}
});
test('expired, revoked and unpaid profiles cannot gain premium from a client flag',()=>{
 const now=new Date('2026-10-25T10:00:00Z');
 expect(legacyPremium({isPremium:false,subscriptionStatus:'ACTIVE',subscriptionExpiresAt:new Date('2030-01-01')},now)).toBe(false);
 for(const status of ['EXPIRED','REVOKED'])expect(legacyPremium({isPremium:true,subscriptionStatus:status,subscriptionExpiresAt:new Date('2030-01-01')},now)).toBe(false);
 expect(legacyPremium({isPremium:true,subscriptionStatus:'CANCELED',subscriptionExpiresAt:new Date('2026-10-25T09:00:00Z')},now)).toBe(false);
 expect(legacyPremium({isPremium:true,subscriptionStatus:'CANCELED',subscriptionExpiresAt:new Date('2026-10-25T11:00:00Z')},now)).toBe(true);
});
test('receipt encryption is authenticated, row-bound and environment-specific',()=>{
 const old=process.env.BILLING_RECEIPT_KEY;process.env.BILLING_RECEIPT_KEY=Buffer.alloc(32,7).toString('base64');
 try{const reference=purchaseReference('GOOGLE','Production','synthetic-token');const encrypted=sealReceipt('synthetic-secret-receipt',reference);
 expect(encrypted).not.toContain('synthetic-secret-receipt');expect(openReceipt(encrypted,reference)).toBe('synthetic-secret-receipt');
 expect(()=>openReceipt(encrypted,purchaseReference('GOOGLE','Sandbox','synthetic-token'))).toThrow();
 const changed=Buffer.from(encrypted,'base64');changed[changed.length-1]^=1;expect(()=>openReceipt(changed.toString('base64'),reference)).toThrow();
 expect(accountBinding('ABC')).toBe(accountBinding('abc'));
 }finally{if(old===undefined)delete process.env.BILLING_RECEIPT_KEY;else process.env.BILLING_RECEIPT_KEY=old;}
});
