import {createHash} from 'crypto';
import {chatObject,chatIdentity,chatSequence,ChatInputError} from './chatRules';
export const defaultNotificationPreferences={chat:true,meetup:true,sourceReply:true,preview:false,version:0};
export function notificationPreferenceInput(value:unknown){
 const body=chatObject(value,['expectedVersion','preferences']),preferences=chatObject(body.preferences,['chat','meetup','sourceReply','preview']);
 if(Object.keys(body).length!==2||Object.keys(preferences).length!==4||Object.values(preferences).some(v=>typeof v!=='boolean'))throw new ChatInputError();
 const input={expectedVersion:chatSequence(body.expectedVersion),preferences:{chat:preferences.chat as boolean,meetup:preferences.meetup as boolean,sourceReply:preferences.sourceReply as boolean,preview:preferences.preview as boolean}};
 return {...input,requestHash:createHash('sha256').update(JSON.stringify(input)).digest('hex')};
}
export function notificationDeviceInput(value:unknown){
 const r=chatObject(value,['deviceId','expoPushToken','platform','registrationVersion']);const deviceId=chatIdentity(r.deviceId);
 if(Object.keys(r).length!==4||typeof r.expoPushToken!=='string'||r.expoPushToken.length>200||!/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(r.expoPushToken)||!['ios','android'].includes(r.platform as string))throw new ChatInputError();
 return {deviceId,registrationVersion:chatSequence(r.registrationVersion),expoPushToken:r.expoPushToken,platform:r.platform as 'ios'|'android'};
}
