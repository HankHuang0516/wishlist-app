import { describe, expect, it } from 'vitest';
import { createAuthOperationGate, isCurrentAuthEpoch } from '../authOperation';

describe('shared native recovery operation gate', () => {
  it('is idle until a form synchronously acquires it', () => {
    const gate = createAuthOperationGate();
    expect(gate.isRunning()).toBe(false);
    const release = gate.tryBegin();
    expect(release).not.toBeNull();
    expect(gate.isRunning()).toBe(true);
    expect(gate.tryBegin()).toBeNull();
    release!();
    expect(gate.isRunning()).toBe(false);
  });

  it('an old or repeated completion cannot release a newer operation', () => {
    const gate = createAuthOperationGate();
    const first = gate.tryBegin()!;
    first(); first();
    const second = gate.tryBegin()!;
    first();
    expect(gate.isRunning()).toBe(true);
    expect(gate.tryBegin()).toBeNull();
    second(); second();
    expect(gate.isRunning()).toBe(false);
  });

  it('different screens do not block each other without an explicit shared gate', () => {
    const first = createAuthOperationGate(), second = createAuthOperationGate();
    const releaseFirst = first.tryBegin()!, releaseSecond = second.tryBegin()!;
    releaseFirst();
    expect(second.isRunning()).toBe(true);
    releaseSecond();
  });

  it('stays acquired across the request and acknowledgement callback', async () => {
    const gate = createAuthOperationGate();
    const release = gate.tryBegin()!;
    try {
      await Promise.resolve();
      expect(gate.isRunning()).toBe(true);
      await Promise.resolve();
      expect(gate.tryBegin()).toBeNull();
    } finally { release(); }
    expect(gate.isRunning()).toBe(false);
  });

  it('can release a rejected request without making the result successful', async () => {
    const gate = createAuthOperationGate();
    const release = gate.tryBegin()!;
    await expect((async () => {
      try { throw new Error('unconfirmed'); }
      finally { release(); }
    })()).rejects.toThrow('unconfirmed');
    expect(gate.isRunning()).toBe(false);
    expect(gate.tryBegin()).not.toBeNull();
  });
});

describe('recovery session epoch admission', () => {
  it.each([0, 1, Number.MAX_SAFE_INTEGER])('admits the original epoch %s', epoch => {
    expect(isCurrentAuthEpoch(epoch, epoch)).toBe(true);
  });
  it.each([[0, 1], [1, 0], [1, 2], [-1, -1], [0.5, 0.5], [NaN, NaN], [Infinity, Infinity], [Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1]])('rejects stale or invalid epochs %s/%s', (expected, current) => {
    expect(isCurrentAuthEpoch(expected, current)).toBe(false);
  });
});
