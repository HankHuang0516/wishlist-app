import prisma from './prisma';
import { billingEnabled } from './billingCatalog';
import { refreshBilling } from './billingService';
// Bounded reconciliation covers renewal/refund changes even when a device is
// offline. Reads refresh independently; a provider outage never fabricates a
// refund, a new credit, or successful payment. No remote payment is initiated.
export function startBillingWorker() {
    let stopped=false, running=false, cursor=0;
    const tick=async()=>{
        if(stopped||running||!billingEnabled('APPLE')&&!billingEnabled('GOOGLE'))return;
        running=true;
        try {
            const rows=await prisma.purchase.findMany({where:{userId:{not:null,gt:cursor},providerReference:{not:null},status:'COMPLETED',
                OR:[{productId:'wishlist_premium_monthly'},{creditRemaining:{gt:0}}]},distinct:['userId'],orderBy:{userId:'asc'},take:25,select:{userId:true}});
            if(!rows.length){cursor=0;return;}
            for(const row of rows){if(stopped)break;cursor=row.userId!;try{await refreshBilling(row.userId!);}catch{console.error('Billing reconciliation remains unconfirmed; provider and receipt details withheld');}}
        } finally {running=false;}
    };
    const timer=setInterval(()=>{void tick().catch(()=>console.error('Billing reconciliation unavailable; details withheld'));},60000);
    timer.unref();
    return()=>{stopped=true;clearInterval(timer);};
}
