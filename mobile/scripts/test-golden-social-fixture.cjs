// Real loopback API assertions for the bounded synthetic Golden social routes.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {startNativeQa}=require('./native-qa.cjs');
let checks=0;
async function request(qa,path,status,token,method='GET',body){
 const response=await fetch(qa.apiUrl+'/api'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(10000)});
 assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');checks++;return response.json();
}
async function login(qa){const a=qa.actors.buyer;return (await request(qa,'/auth/login',200,null,'POST',{phoneNumber:a.email,password:a.password})).token;}
async function main(){
 const original=await startNativeQa(process.env.TEST_DATABASE_URL,60);let originalCleanup;
 try{const token=await login(original);await request(original,'/users/me/follow-state/'+original.actors.seller.id,404,token);}
 finally{originalCleanup=await original.stop();}assert.ok(Object.values(originalCleanup).every(v=>v===0));
 const qa=await startNativeQa(process.env.TEST_DATABASE_URL,60,{visualHomeFixture:true});let cleanup;
 try{
  const token=await login(qa),targetUserId=qa.actors.seller.id,path='/users/me/follow-state/'+targetUserId;
  await request(qa,path,401,null);
  const state=await request(qa,path,200,token);assert.equal(state.targetUserId,targetUserId);assert.equal(state.isFollowing,false);
  await request(qa,'/users/me/follow-state/2147483646',403,token);
  await request(qa,'/users/me/follow-operations/'+randomUUID(),403,token,'POST',{targetUserId:2147483646,wanted:true,expectedVersion:0});
  await request(qa,'/users/'+targetUserId+'/follow',404,token,'POST',{});
  const operation='/users/me/follow-operations/'+randomUUID(),body={targetUserId,wanted:true,expectedVersion:state.followingVersion};
  const applied=await request(qa,operation,200,token,'POST',body);assert.equal(applied.receipt.state,'APPLIED');assert.equal(applied.current.isFollowing,true);
  const replay=await request(qa,operation,200,token,'POST',body);assert.deepEqual(replay.receipt,applied.receipt);
  const read=await request(qa,operation,200,token);assert.deepEqual(read.receipt,applied.receipt);
  const current=await request(qa,path,200,token);assert.equal(current.followingCount,1);assert.equal(current.followingVersion,state.followingVersion+1);assert.equal(current.isFollowing,true);
 }finally{cleanup=await qa.stop();}
 assert.equal(cleanup.followsRemaining,0);assert.ok(Object.values(cleanup).every(v=>v===0));
 console.log(JSON.stringify({kind:'isolated-golden-social-fixture',passed:true,httpChecks:checks,followConfirmed:true,cleanup,credentialsSerialized:false,productionMutations:0}));
}
main().catch(()=>{console.error('Golden social fixture assertions failed; raw diagnostics withheld');process.exitCode=1;});
