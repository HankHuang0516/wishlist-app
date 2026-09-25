import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { validateApiUrl } from './api';
import { uuid } from './listingForm';

export type PrivateCapture = { clientUploadId: string; uri: string };

async function accountDirectory(apiUrl: string, userId: number) {
  if (!Number.isSafeInteger(userId) || userId < 1 || userId > 2147483647) throw new Error('Invalid private capture scope');
  const scope = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, validateApiUrl(apiUrl, __DEV__));
  return new Directory(Paths.document, 'wishlist-private-captures-v1', scope, String(userId));
}

function captureFile(directory: Directory, clientUploadId: string) {
  if (!uuid(clientUploadId)) throw new Error('Invalid private capture ID');
  return new File(directory, `${clientUploadId.toLowerCase()}.jpg`);
}

/** A completed rename is the commit marker. Never upload from the volatile image-picker cache. */
export async function preservePrivateCapture(apiUrl: string, userId: number, clientUploadId: string, sourceUri: string): Promise<string> {
  const directory = await accountDirectory(apiUrl, userId);
  const destination = captureFile(directory, clientUploadId);
  directory.create({ intermediates: true, idempotent: true });
  if (destination.exists) throw new Error('Private capture ID already exists');
  const partial = new File(directory, `${clientUploadId.toLowerCase()}.partial`);
  if (partial.exists) throw new Error('Private capture is incomplete');
  try {
    await new File(sourceUri).copy(partial);
    if (!partial.exists || (partial.info().size ?? 0) < 1) throw new Error('Private capture copy failed');
    await partial.move(destination);
  } catch (failure) {
    // A partial copy cannot be offered for upload or silently consume storage.
    if (partial.exists) partial.delete();
    throw failure;
  }
  return destination.uri;
}

export async function listPrivateCaptures(apiUrl: string, userId: number): Promise<PrivateCapture[]> {
  const directory = await accountDirectory(apiUrl, userId);
  if (!directory.exists) return [];
  return directory.list().filter((entry): entry is File => entry instanceof File)
    .filter(file => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i.test(file.name))
    .map(file => {
      const info = file.info();
      if (!info.exists || (info.size ?? 0) < 1) throw new Error('Private capture is incomplete');
      return { file, info };
    })
    .sort((a, b) => (a.info.creationTime ?? a.info.modificationTime ?? 0) - (b.info.creationTime ?? b.info.modificationTime ?? 0))
    .map(({ file }) => ({ clientUploadId: file.name.slice(0, -4), uri: file.uri }));
}

export async function releasePrivateCapture(apiUrl: string, userId: number, clientUploadId: string) {
  const directory = await accountDirectory(apiUrl, userId);
  const file = captureFile(directory, clientUploadId);
  if (file.exists) file.delete();
}

/** Only after authoritative account erasure, never on logout. */
export async function erasePrivateCaptures(apiUrl: string, userId: number) {
  const directory = await accountDirectory(apiUrl, userId);
  if (directory.exists) directory.delete();
}
