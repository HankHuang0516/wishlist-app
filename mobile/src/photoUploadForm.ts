import { File } from 'expo-file-system';

// Expo's fetch converts Blob/File parts via bytes(); React Native's legacy
// { uri, name, type } FormData part throws before any HTTP request is sent.
export function jpegPhotoUploadForm(clientUploadId: string, uri: string, filename: string,
  capturePurpose?: 'MANUAL_PHOTO' | 'BATCH_ITEM') {
  if (!/^(?:file|content):\/\//.test(uri)) throw new Error('無法讀取本機照片');
  const image = new File(uri);
  if (!image.exists) throw new Error('處理後的照片檔案不存在');
  if (image.type !== 'image/jpeg') throw new Error('處理後的照片格式不正確：' + String(image.type));
  const body = new FormData();
  body.append('clientUploadId', clientUploadId);
  if (capturePurpose) body.append('capturePurpose', capturePurpose);
  body.append('image', image as unknown as Blob, filename);
  return body;
}
