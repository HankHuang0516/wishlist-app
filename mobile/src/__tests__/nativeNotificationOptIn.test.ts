import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const state=vi.hoisted(()=>({
 storage:new Map<string,string>(),randomUUID:vi.fn(),get:vi.fn(),set:vi.fn(),
 permissions:vi.fn(),request:vi.fn(),token:vi.fn(),unregister:vi.fn(),dismiss:vi.fn(),badge:vi.fn(),
}));
vi.mock('react',()=>({useEffect:()=>undefined,useRef:(value:unknown)=>({current:value}),useState:(value:unknown)=>[value,vi.fn()]}));
vi.mock('react-native',()=>({Platform:{OS:'android'},AppState:{currentState:'active'},DeviceEventEmitter:{emit:vi.fn()}}));
vi.mock('expo-crypto',()=>({CryptoDigestAlgorithm:{SHA256:'SHA256'},digestStringAsync:async()=>'synthetic-scope',randomUUID:state.randomUUID}));
vi.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:'device-only',getItemAsync:state.get,setItemAsync:state.set,deleteItemAsync:vi.fn()}));
vi.mock('expo-constants',()=>({default:{expoConfig:{extra:{eas:{projectId:'36cff414-22d4-4c30-9c34-9cd5788d0452'}}}}}));
vi.mock('expo-notifications',()=>({getPermissionsAsync:state.permissions,requestPermissionsAsync:state.request,getExpoPushTokenAsync:state.token,
 unregisterForNotificationsAsync:state.unregister,dismissAllNotificationsAsync:state.dismiss,setBadgeCountAsync:state.badge,
 setNotificationChannelAsync:vi.fn(),AndroidImportance:{DEFAULT:3},AndroidNotificationVisibility:{PRIVATE:0}}));
import {useNativeNotifications} from '../nativeNotifications';
import type {createApi} from '../api';

const scope='wishlist.push.v1.synthetic-scope',id='7c4c52b0-e628-4ce7-9417-5622b0628615';
function setup(){
 const api=vi.fn(async(_route:string,options?:{body?:string})=>{
  const body=JSON.parse(options?.body??'{}');return {registered:true,deviceId:body.deviceId,registrationVersion:body.registrationVersion};
 });
 return {api,runtime:useNativeNotifications(api as unknown as ReturnType<typeof createApi>,'https://owned.example.invalid/api',42,null,vi.fn())};
}
beforeEach(()=>{
 vi.stubGlobal('__DEV__',false);vi.clearAllMocks();state.storage.clear();
 state.get.mockImplementation(async(key:string)=>state.storage.get(key)??null);
 state.set.mockImplementation(async(key:string,value:string)=>{state.storage.set(key,value);});
 state.randomUUID.mockReturnValue(id);state.permissions.mockResolvedValue({granted:false,canAskAgain:false,status:'denied'});
 state.token.mockResolvedValue({data:'ExponentPushToken[synthetic]'});
 state.unregister.mockResolvedValue(undefined);state.dismiss.mockResolvedValue(undefined);state.badge.mockResolvedValue(undefined);
});
afterEach(()=>vi.unstubAllGlobals());

describe('optional push identity and disconnect lifecycle',()=>{
 it('logs out a never-enabled account without generating, storing or sending an installation ID',async()=>{
  const {api,runtime}=setup();await runtime.disconnect();
  expect(state.randomUUID).not.toHaveBeenCalled();expect(state.set).not.toHaveBeenCalled();expect(api).not.toHaveBeenCalled();
  expect(state.token).not.toHaveBeenCalled();expect(state.unregister).toHaveBeenCalledOnce();expect(state.dismiss).toHaveBeenCalledOnce();expect(state.badge).toHaveBeenCalledWith(0);
 });
 it('does not auto-register without the account opt-in marker',async()=>{
  const {api,runtime}=setup();await runtime.enable(false);
  expect(api).not.toHaveBeenCalled();expect(state.token).not.toHaveBeenCalled();expect(state.randomUUID).not.toHaveBeenCalled();
 });
 it('does not mint a new ID when system permission is denied',async()=>{
  const {api,runtime}=setup();await runtime.enable();
  expect(api).not.toHaveBeenCalled();expect(state.randomUUID).not.toHaveBeenCalled();expect(state.token).not.toHaveBeenCalled();
  expect(state.storage.has(scope+'.installation')).toBe(false);expect(state.storage.has(scope+'.enabled.42')).toBe(false);
  expect(state.unregister).toHaveBeenCalledOnce();
 });
 it('revokes the existing version and cleans up the provider after an API failure',async()=>{
  state.storage.set(scope+'.enabled.42','1');state.storage.set(scope+'.installation',JSON.stringify({id,version:7}));const {api,runtime}=setup();api.mockRejectedValueOnce(new Error('offline'));
  await runtime.disconnect();expect(api).toHaveBeenCalledWith('/notifications/devices',expect.objectContaining({method:'DELETE',body:JSON.stringify({deviceId:id,registrationVersion:7})}));
  expect(state.randomUUID).not.toHaveBeenCalled();expect(state.unregister).toHaveBeenCalledOnce();expect(state.badge).toHaveBeenCalledWith(0);
 });
 it('still unregisters a previously known device when permission-revocation cleanup cannot reach the API',async()=>{
  state.storage.set(scope+'.enabled.42','1');state.storage.set(scope+'.installation',JSON.stringify({id,version:4}));const {api,runtime}=setup();api.mockRejectedValueOnce(new Error('offline'));
  await runtime.enable();expect(api).toHaveBeenCalledOnce();expect(state.unregister).toHaveBeenCalledOnce();expect(state.randomUUID).not.toHaveBeenCalled();expect(state.token).not.toHaveBeenCalled();
 });
 it('cleans up the provider but preserves an unconfirmed-disconnect error for corrupt local state',async()=>{
  state.storage.set(scope+'.enabled.42','1');state.storage.set(scope+'.installation','{"id":"bad","version":1}');const {api,runtime}=setup();
  await expect(runtime.disconnect()).rejects.toThrow('cannot be restored');expect(api).not.toHaveBeenCalled();expect(state.randomUUID).not.toHaveBeenCalled();expect(state.unregister).toHaveBeenCalledOnce();
 });
 it('creates one identity only after explicit permission and reuses it on logout',async()=>{
  state.permissions.mockResolvedValue({granted:true,canAskAgain:true,status:'granted'});const {api,runtime}=setup();await runtime.enable();
  expect(state.randomUUID).toHaveBeenCalledOnce();expect(state.storage.get(scope+'.enabled.42')).toBe('1');
  expect(api).toHaveBeenCalledWith('/notifications/devices',expect.objectContaining({method:'POST',body:JSON.stringify({deviceId:id,registrationVersion:1,expoPushToken:'ExponentPushToken[synthetic]',platform:'android'})}));
  await runtime.disconnect();expect(state.randomUUID).toHaveBeenCalledOnce();expect(api).toHaveBeenLastCalledWith('/notifications/devices',expect.objectContaining({method:'DELETE',body:JSON.stringify({deviceId:id,registrationVersion:1})}));
 });
 it('does not associate a previous account installation with a current account that never opted in',async()=>{
  state.storage.set(scope+'.installation',JSON.stringify({id,version:7}));state.storage.set(scope+'.enabled.41','1');const {api,runtime}=setup();
  await runtime.disconnect();expect(api).not.toHaveBeenCalled();expect(state.randomUUID).not.toHaveBeenCalled();expect(state.unregister).toHaveBeenCalledOnce();
 });
 it('turns off a never-enabled account without writing a consent marker or sending another account device ID',async()=>{
  state.storage.set(scope+'.installation',JSON.stringify({id,version:7}));const {api,runtime}=setup();await runtime.disable();
  expect(api).not.toHaveBeenCalled();expect(state.set).not.toHaveBeenCalled();expect(state.randomUUID).not.toHaveBeenCalled();expect(state.unregister).toHaveBeenCalledOnce();
 });
 it('serializes enable then disable so the final opt-out cannot be overwritten by the earlier enable',async()=>{
  state.permissions.mockResolvedValue({granted:true,canAskAgain:true,status:'granted'});const {api,runtime}=setup();
  await Promise.all([runtime.enable(),runtime.disable()]);expect(state.storage.get(scope+'.enabled.42')).toBe('0');expect(api).toHaveBeenCalledTimes(2);
  expect(api.mock.calls.map(call=>JSON.parse(call[1]!.body!))).toEqual([
   {deviceId:id,registrationVersion:1,expoPushToken:'ExponentPushToken[synthetic]',platform:'android'},
   {deviceId:id,registrationVersion:1},
  ]);
  await runtime.enable(false);expect(state.token).toHaveBeenCalledOnce();expect(api).toHaveBeenCalledTimes(2);
 });
 it('still cleans up the provider and reports unconfirmed disconnect when secure storage cannot be read',async()=>{
  state.get.mockRejectedValueOnce(new Error('locked'));const {api,runtime}=setup();
  await expect(runtime.disconnect()).rejects.toThrow('locked');expect(api).not.toHaveBeenCalled();expect(state.randomUUID).not.toHaveBeenCalled();expect(state.unregister).toHaveBeenCalledOnce();
 });
 it('attempts existing server and provider cleanup even when saving an opt-out fails',async()=>{
  state.storage.set(scope+'.enabled.42','1');state.storage.set(scope+'.installation',JSON.stringify({id,version:3}));state.set.mockRejectedValueOnce(new Error('locked'));
  const {api,runtime}=setup();await runtime.disable();expect(api).toHaveBeenCalledWith('/notifications/devices',expect.objectContaining({method:'DELETE',body:JSON.stringify({deviceId:id,registrationVersion:3})}));
  expect(state.unregister).toHaveBeenCalledOnce();expect(state.randomUUID).not.toHaveBeenCalled();
 });
 it('does not transmit a known ID when its account consent marker is corrupt',async()=>{
  state.storage.set(scope+'.enabled.42','corrupt');state.storage.set(scope+'.installation',JSON.stringify({id,version:3}));const {api,runtime}=setup();
  await runtime.enable();expect(api).not.toHaveBeenCalled();expect(state.unregister).toHaveBeenCalledOnce();expect(state.token).not.toHaveBeenCalled();
  await expect(runtime.disconnect()).rejects.toThrow('consent cannot be restored');expect(api).not.toHaveBeenCalled();expect(state.unregister).toHaveBeenCalledTimes(2);
 });
 it('does not turn a falsy secure-storage rejection into a confirmed disconnect',async()=>{
  state.get.mockRejectedValueOnce(undefined);const {api,runtime}=setup();let rejected=false;
  await runtime.disconnect().catch(()=>{rejected=true;});expect(rejected).toBe(true);expect(api).not.toHaveBeenCalled();expect(state.unregister).toHaveBeenCalledOnce();
 });
 it('still dismisses account notifications and clears the badge if provider unregistration fails',async()=>{
  state.unregister.mockRejectedValueOnce(new Error('provider unavailable'));const {api,runtime}=setup();
  await expect(runtime.disconnect()).rejects.toThrow('provider unavailable');expect(api).not.toHaveBeenCalled();expect(state.dismiss).toHaveBeenCalledOnce();expect(state.badge).toHaveBeenCalledWith(0);
 });
});
