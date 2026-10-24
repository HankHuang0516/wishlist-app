import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {optInPushManifest}=require('../../plugins/withOptInPush.js');
const manifest=(metadata?:unknown)=>({manifest:{application:[{$:{'android:name':'.MainApplication'},...(metadata===undefined?{}:{'meta-data':metadata})}]}});
describe('optional push installation registration',()=>{
 it('overrides automatic Firebase registration while preserving notification channel metadata',()=>{
  const channel={$:{'android:name':'com.google.firebase.messaging.default_notification_channel_id','android:value':'transactions'}};
  const result=optInPushManifest(manifest([channel,{$:{'android:name':'firebase_messaging_auto_init_enabled','android:value':'true'}}]));
  expect(result.manifest.application[0]['meta-data']).toEqual([channel,
   {$:{'android:name':'firebase_messaging_auto_init_enabled','android:value':'false'}},
   {$:{'android:name':'firebase_analytics_collection_enabled','android:value':'false'}}]);
  expect(optInPushManifest(result)).toEqual(result);
 });
 it('applies on fresh native regeneration and rejects malformed manifests',()=>{
  expect(optInPushManifest(manifest()).manifest.application[0]['meta-data']).toHaveLength(2);
  expect(()=>optInPushManifest(manifest({}))).toThrow('Unrecognized');
  expect(()=>optInPushManifest({manifest:{application:[]}})).toThrow();
  const config=require('../../app.config.js').expo;
  expect(config.plugins.indexOf('./plugins/withOptInPush')).toBeGreaterThan(config.plugins.indexOf('expo-notifications'));
 });
});
