import {LeadError,object} from './sourceLeadRules';
export function deliveryHistory(raw:unknown):any[]{
 const saved=raw?object(raw):{};
 if(saved.history===undefined)return [];
 if(!Array.isArray(saved.history)||saved.history.length>20||saved.history.some((r:any)=>!r||typeof r!=='object'||!r.reservation||!r.receipt))throw new LeadError('INVALID_ROUND_HISTORY');
 return saved.history;
}
export function beginInquiryFollowup(raw:unknown,events:any[]){
 const saved=object(raw),history=deliveryHistory(saved);
 if(!saved.reservation||!saved.receipt||history.length>=19)throw new LeadError('CONFIRMED_PRIOR_ROUND_REQUIRED');
 const {history:ignored,...prior}=saved;
 const consumed=new Set(history.flatMap(r=>r.reservation.questionIds??[]));
 const questionIds=saved.reservation.questionIds??events.filter(e=>e.action==='ASK'&&!consumed.has(e.requestId)).map(e=>e.requestId);
 return {history:[...history,{...prior,reservation:{...prior.reservation,questionIds}}]};
}
export function pendingRoundQuestions(snapshot:any,raw:unknown){
 const consumed=new Set(deliveryHistory(raw).flatMap(r=>r.reservation.questionIds??[]));
 return snapshot.questions.filter((q:any)=>!consumed.has(q.requestId));
}
export function findDeliveredRound(raw:unknown,reservationId:string){
 const saved=raw?object(raw):{};
 return [saved,...deliveryHistory(saved)].find(r=>r.receipt?.reservationId===reservationId&&r.reservation?.id===reservationId);
}
