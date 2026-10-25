import * as Crypto from 'expo-crypto';
import {meetupRequest,parseMeetupResult,type MeetupRequest} from './meetupData';
import type {ChatRoomRecord} from './chatData';
import {PendingStoreError,type PendingStore} from './pendingStore';
import type {createApi} from './api';
export async function meetupRequestHash(request:MeetupRequest){
 const parsed=meetupRequest(request),original=parsed.terms;
 const terms=original?{startsAt:original.startsAt,endsAt:new Date(Date.parse(original.startsAt)+original.durationMinutes*60000).toISOString(),timeZone:original.timeZone,placeName:original.placeName,latitude:original.latitude??null,longitude:original.longitude??null,notes:original.notes}:undefined;
 return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,JSON.stringify({action:parsed.action,expectedVersion:parsed.expectedVersion,terms}));
}
export async function lookupMeetupAction(read:ReturnType<typeof createApi>,room:ChatRoomRecord,userId:number,store:PendingStore,key:string,body:string){
 const request=meetupRequest(JSON.parse(body));if(JSON.stringify(request)!==body||![room.buyerUserId,room.sellerUserId].includes(userId)||await store.get(key)!==body)throw new PendingStoreError();
 const hash=await meetupRequestHash(request);if(await store.get(key)!==body)throw new PendingStoreError();
 const value=await read<{replayed?:unknown;receipt?:{requestHash?:unknown}}>('/chat/conversations/'+room.id+'/meetup/operations/'+request.clientActionId+'?requestHash='+hash);
 if(value?.replayed!==true||value.receipt?.requestHash!==hash)throw new PendingStoreError();
 return parseMeetupResult(value,room,request,userId);
}
