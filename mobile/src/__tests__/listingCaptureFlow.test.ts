import { describe, expect, it } from 'vitest';
import { captureCameraSequence } from '../listingCaptureFlow';

describe('private camera capture sequence', () => {
  it('persists one shot before asking the camera for another', async () => {
    const order: string[] = [];
    let next = 0;
    const result = await captureCameraSequence(3,
      async () => { order.push('camera'); return ++next <= 2 ? next : null; },
      async (asset, position) => { order.push(`save:${asset}:${position}`); return true; });
    expect(order).toEqual(['camera', 'save:1:1', 'camera', 'save:2:2', 'camera']);
    expect(result).toEqual({ captured: 2, saved: 2, stopped: 'CANCELLED' });
  });

  it('stops before another shot when private storage has not been confirmed', async () => {
    const order: string[] = [];
    const result = await captureCameraSequence(12,
      async () => { order.push('camera'); return 'photo'; },
      async () => { order.push('save-failed'); return false; });
    expect(order).toEqual(['camera', 'save-failed']);
    expect(result).toEqual({ captured: 1, saved: 0, stopped: 'UNSAVED' });
  });

  it('does not exceed the private batch cap', async () => {
    let cameraOpens = 0;
    const result = await captureCameraSequence(2,
      async () => { cameraOpens++; return 'photo'; }, async () => true);
    expect(cameraOpens).toBe(2);
    expect(result).toEqual({ captured: 2, saved: 2, stopped: 'LIMIT' });
  });

  it('never calls the camera or storage when there is no remaining capacity', async () => {
    const result = await captureCameraSequence(0,
      async () => { throw new Error('camera opened'); }, async () => { throw new Error('storage called'); });
    expect(result).toEqual({ captured: 0, saved: 0, stopped: 'LIMIT' });
  });
});
