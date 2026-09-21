/** Shared by the form and native modal back handler; contains no credentials. */
export interface AuthOperationGate {
  tryBegin(): (() => void) | null;
  isRunning(): boolean;
}

export function createAuthOperationGate(): AuthOperationGate {
  let owner: symbol | null = null;
  return {
    isRunning: () => owner !== null,
    tryBegin() {
      if (owner !== null) return null;
      const ticket = Symbol('auth-operation');
      owner = ticket;
      return () => { if (owner === ticket) owner = null; };
    },
  };
}

/** A delayed recovery response may only affect the session that started it. */
export function isCurrentAuthEpoch(expected: number, current: number): boolean {
  return Number.isSafeInteger(expected) && expected >= 0 && expected === current;
}
