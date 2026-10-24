import { File } from 'expo-file-system';
import type {PhotoMessageRequest} from './chatPhoto';

// Expo's fetch converts Blob/File parts via bytes(); React Native's legacy
// { uri, name, type } FormData part throws before any HTTP request is sent.
function jpegFile(uri:string) {
  if (!/^(?:file|content):\/\//.test(uri)) throw new Error('無法讀取本機照片');
  const image = new File(uri);
  if (!image.exists) throw new Error('處理後的照片檔案不存在');
  if (image.type !== 'image/jpeg') throw new Error('處理後的照片格式不正確：' + String(image.type));
  return image;
}

export function jpegPhotoUploadForm(clientUploadId: string, uri: string, filename: string,
  capturePurpose?: 'MANUAL_PHOTO' | 'BATCH_ITEM') {
  const image=jpegFile(uri);
  const body = new FormData();
  body.append('clientUploadId', clientUploadId);
  if (capturePurpose) body.append('capturePurpose', capturePurpose);
  body.append('image', image as unknown as Blob, filename);
  return body;
}

export function jpegChatPhotoUploadForm(request:PhotoMessageRequest,uri:string) {
  const image=jpegFile(uri),body=new FormData();
  body.append('clientMessageId',request.clientMessageId);
  body.append('text',request.text);
  body.append('photo',image as unknown as Blob,'chat-photo.jpg');
  return body;
}
