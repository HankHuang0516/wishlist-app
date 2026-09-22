import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { validateApiUrl } from './api';
import { createDeletionRecovery } from './deletionRecovery';
export const deletionPrivateStore = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
export async function nativeDeletionRecovery(apiUrl: string) {
  const scope = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, validateApiUrl(apiUrl, __DEV__));
  return createDeletionRecovery(deletionPrivateStore, `wishlist.deletion.v1.${scope}`, apiUrl, __DEV__);
}
