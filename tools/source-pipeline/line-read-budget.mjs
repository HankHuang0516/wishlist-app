/** Bounds read-only CUA observations. Never wrap clicks, typing or uploads here.
 * Timing out does not cancel the native read: keep its lane occupied until it
 * settles, discard the late result, and never automatically replay UI actions.
 */
export class LineReadTimeout extends Error {
  constructor(operation, timeoutMs) {
    super(`LINE_READ_TIMEOUT:${operation}:${timeoutMs}`);
    this.name = 'LineReadTimeout';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}
export function createLineReadBudget({budgetMs = 100000, reserveMs = 15000, readTimeoutMs = 12000} = {}) {
  if (![budgetMs, reserveMs, readTimeoutMs].every(Number.isSafeInteger) || reserveMs < 0 || readTimeoutMs <= 0 || budgetMs <= reserveMs) throw Error('Invalid LINE read budget');
  const deadline = Date.now() + budgetMs - reserveMs;
  const inFlight = new Set();
  return {
    remainingMs: () => Math.max(0, deadline - Date.now()),
    async read(operation, observe) {
      if (inFlight.has(operation)) throw Error(`LINE_READ_STILL_PENDING:${operation}`);
      const timeoutMs = Math.min(readTimeoutMs, Math.max(0, deadline - Date.now()));
      if (!timeoutMs) throw new LineReadTimeout(operation, 0);
      inFlight.add(operation);
      let timer;
      const observation = Promise.resolve().then(observe).finally(() => inFlight.delete(operation));
      try {
        return await Promise.race([observation, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new LineReadTimeout(operation, timeoutMs)), timeoutMs);
        })]);
      } finally { clearTimeout(timer); }
    }
  };
}
