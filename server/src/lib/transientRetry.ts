/** Bounded retries for upstream inference only; never wrap database writes. */
export interface RetryOptions {
    maxAttempts?: number;
    sleep?: (milliseconds: number) => Promise<void>;
    random?: () => number;
}

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export function isTransientUpstreamError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const status = Number((error as { status?: unknown }).status);
    return Number.isInteger(status) && TRANSIENT_STATUSES.has(status);
}

export async function withTransientRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {},
): Promise<T> {
    const maxAttempts = options.maxAttempts ?? 3;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
        throw new RangeError('maxAttempts must be an integer between 1 and 5');
    }
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
    const random = options.random ?? Math.random;

    for (let attempt = 1; ; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= maxAttempts || !isTransientUpstreamError(error)) throw error;
            // Retry metadata contains no prompt, credential, URL or user data.
            const jitter = Math.floor(Math.max(0, Math.min(1, random())) * 250);
            await sleep(Math.min(8000, 1000 * 2 ** (attempt - 1)) + jitter);
        }
    }
}
