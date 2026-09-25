export type CameraCaptureResult = { captured: number; saved: number; stopped: 'CANCELLED' | 'UNSAVED' | 'LIMIT' };

// Never request the next camera shot until the previous photo is confirmed private.
export async function captureCameraSequence<Asset>(
  limit: number,
  takePhoto: () => Promise<Asset | null>,
  savePhoto: (asset: Asset, position: number) => Promise<boolean>,
): Promise<CameraCaptureResult> {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Invalid capture limit');
  let captured = 0, saved = 0;
  while (captured < limit) {
    const asset = await takePhoto();
    if (asset === null) return { captured, saved, stopped: 'CANCELLED' };
    captured++;
    if (!await savePhoto(asset, captured)) return { captured, saved, stopped: 'UNSAVED' };
    saved++;
  }
  return { captured, saved, stopped: 'LIMIT' };
}
