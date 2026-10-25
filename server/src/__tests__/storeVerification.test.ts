import axios from 'axios';
import {generateKeyPairSync} from 'crypto';
import {verifyApple,verifyGoogle,accountBinding} from '../lib/storeVerification';
jest.mock('axios');
const http=axios as jest.Mocked<typeof axios>;
const original={...process.env};
beforeEach(()=>{
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:'synthetic@example.invalid',private_key:privateKey.export({type:'pkcs8',format:'pem'}).toString()});
 http.post.mockResolvedValue({data:{access_token:'synthetic-local-provider-token'}});
});
afterAll(()=>{process.env=original;});
test('Apple rejects fabricated JWS without accepting a client premium claim',async()=>{
 const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});process.env.APPLE_IAP_PRIVATE_KEY=privateKey.export({type:'pkcs8',format:'pem'}).toString();
 process.env.APPLE_IAP_KEY_ID='SYNTHETIC';process.env.APPLE_IAP_ISSUER_ID='synthetic';
 await expect(verifyApple('wishlist_premium_monthly','eyJhbGciOiJub25lIn0.eyJwcmVtaXVtIjp0cnVlfQ.fake','Production')).rejects.toThrow();
 expect(http.request).not.toHaveBeenCalled();
});
test('pending and test receipts cannot become production credits',async()=>{
 http.request.mockResolvedValue({data:{purchaseState:2,purchaseType:1}});await expect(verifyGoogle('wishlist_marketing_10','synthetic-pending-token','Production')).rejects.toMatchObject({code:'BILLING_PURCHASE_PENDING'});
 http.request.mockResolvedValue({data:{purchaseState:0,purchaseType:0}});await expect(verifyGoogle('wishlist_marketing_10','synthetic-test-token','Production')).rejects.toMatchObject({code:'BILLING_ENVIRONMENT_MISMATCH'});
});
test('provider receipt must carry a bound account and quantity 1',async()=>{
 http.request.mockResolvedValue({data:{purchaseState:0,purchaseType:1,orderId:'synthetic-order',quantity:1}});await expect(verifyGoogle('wishlist_marketing_10','synthetic-unbound-token','Production')).rejects.toMatchObject({code:'BILLING_INVALID_RECEIPT'});
 http.request.mockResolvedValue({data:{purchaseState:0,purchaseType:1,orderId:'synthetic-order',quantity:2,obfuscatedExternalAccountId:'a'.repeat(64)}});await expect(verifyGoogle('wishlist_marketing_10','synthetic-multi-token','Production')).rejects.toMatchObject({code:'BILLING_INVALID_RECEIPT'});
});
test('production amount is the actual order total, not US1 catalogue or client amount',async()=>{
 const binding=accountBinding('11111111-1111-4111-8111-111111111111');
 http.request.mockResolvedValueOnce({data:{purchaseState:0,purchaseType:1,orderId:'synthetic-order-123',quantity:1,consumptionState:0,obfuscatedExternalAccountId:binding}}).mockResolvedValueOnce({data:{lineItems:[{productId:'wishlist_marketing_10',total:{currencyCode:'TWD',units:'33',nanos:500000000}}]}});
 const result=await verifyGoogle('wishlist_marketing_10','synthetic-purchase-token','Production');expect(result).toMatchObject({amount:33.5,currency:'TWD',binding,active:true,externalId:'synthetic-order-123',needsFinish:true});
 expect(http.request.mock.calls[1][0]?.url).toContain('/orders/synthetic-order-123');
});
test('unverified order total does not fall back to a fabricated price',async()=>{
 http.request.mockResolvedValueOnce({data:{purchaseState:0,purchaseType:1,orderId:'synthetic-order',quantity:1,obfuscatedExternalAccountId:'a'.repeat(64)}}).mockResolvedValueOnce({data:{lineItems:[]}});
 await expect(verifyGoogle('wishlist_sponsor_90','synthetic-purchase-token-2','Production')).rejects.toMatchObject({code:'BILLING_ORDER_UNCONFIRMED'});
});
