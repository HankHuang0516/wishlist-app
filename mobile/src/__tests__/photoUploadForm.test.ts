import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system', () => ({
  File: class extends Blob {
    readonly uri: string;
    readonly exists: boolean;
    readonly name = 'processed.jpg';
    constructor(uri: string) {
      super([new Uint8Array([0xff, 0xd8, 0xff])], { type: uri.endsWith('.jpg') ? 'image/jpeg' : 'image/png' });
      this.uri = uri;
      this.exists = !uri.includes('missing');
    }
  },
}));

import { jpegPhotoUploadForm } from '../photoUploadForm';

describe('jpegPhotoUploadForm', () => {
  it('sends actual file bytes as a multipart Blob, never a legacy URI part', () => {
    const form = jpegPhotoUploadForm('upload-id', 'file:///cache/processed.jpg', 'wish-photo.jpg');
    expect(form.get('clientUploadId')).toBe('upload-id');
    const image = form.get('image');
    expect(image).toBeInstanceOf(Blob);
    expect((image as Blob).type).toBe('image/jpeg');
    expect((image as Blob).size).toBe(3);
    expect((image as { uri?: string }).uri).toBeUndefined();
  });

  it('rejects missing or non-JPEG files before requesting upload', () => {
    expect(() => jpegPhotoUploadForm('id', 'https://example.com/a.jpg', 'wish.jpg')).toThrow();
    expect(() => jpegPhotoUploadForm('id', 'file:///cache/missing.jpg', 'wish.jpg')).toThrow();
    expect(() => jpegPhotoUploadForm('id', 'file:///cache/image.png', 'wish.jpg')).toThrow();
  });
});
