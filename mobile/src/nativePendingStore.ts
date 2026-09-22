import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { validateApiUrl } from './api';
import { createPendingStore } from './pendingStore';
import { createPrivatePendingIndex } from './privatePendingIndex';
const privatePendingIndex = createPrivatePendingIndex({
  get: key => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  remove: key => SecureStore.deleteItemAsync(key),
});
export const privatePendingStore = createPendingStore(privatePendingIndex.privateStore, Crypto.randomUUID);
async function pendingScope(apiUrl: string, userId: number) {
  if (!Number.isSafeInteger(userId) || userId < 1 || userId > 2147483647) throw new Error('Invalid private request scope');
  const scope = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, validateApiUrl(apiUrl, __DEV__));
  return `wishlist.pending.v1.${scope}.${userId}`;
}
// Only call after an authoritative ERASED acknowledgement. This fences every
// later write for that account; it is NOT logout or cancellation cleanup.
export async function erasePrivatePendingData(apiUrl: string, userId: number) {
  return privatePendingIndex.erase(await pendingScope(apiUrl, userId));
}
export async function pendingRequestKey(apiUrl: string, userId: number, resource: string) {
  if (!Number.isSafeInteger(userId) || userId < 1 || !/^(listing|wish-create|listing-report|(message|meetup)\.[0-9a-f-]{36})$/i.test(resource)) throw new Error('Invalid private request scope');
  return `${await pendingScope(apiUrl, userId)}.${resource.toLowerCase()}`;
}
