import { currentInquiryQuestions, transferSnapshot } from '../lib/sourceLeadRules';
import { reopenInquiryDelivery, pendingRoundQuestions } from '../lib/sourceInquiryRounds';
const event=(action:string,text?:string)=>({requestId:require('crypto').randomUUID(),action,text,at:new Date().toISOString()});
test('correction and withdrawal boundaries keep old audit events out of the new transfer',()=>{
 const old=event('ASK','舊問題'),correction=event('REVISE','更正後'),extra=event('ASK','補充');
 expect(currentInquiryQuestions([old,correction,extra])).toEqual([correction,extra]);
 expect(currentInquiryQuestions([old,correction,event('CANCEL')])).toEqual([]);
 const reopened=event('REOPEN','重新詢問');expect(currentInquiryQuestions([old,correction,event('CANCEL'),reopened])).toEqual([reopened]);
 const snapshot=transferSnapshot({id:'lead',contentHash:'hash',canonicalUrl:'url'} as any,[old,correction,event('CANCEL'),reopened]);
 expect(pendingRoundQuestions(snapshot,null)).toEqual([{requestId:reopened.requestId,text:'重新詢問'}]);
});
test('reopening archives delivered evidence and removes the previous cancellation from the next delivery',()=>{
 const prior={reservation:{id:'prior',questionIds:['old']},receipt:{reservationId:'prior'},cancelRequestedAt:new Date().toISOString()};
 expect(reopenInquiryDelivery(prior,[])).toEqual({history:[prior]});
 expect(reopenInquiryDelivery({history:[prior],cancelRequestedAt:'old'},[])).toEqual({history:[prior]});
 expect(()=>reopenInquiryDelivery({reservation:{id:'unconfirmed'},cancelRequestedAt:'old'},[])).toThrow('INQUIRY_CLOSED');
});
