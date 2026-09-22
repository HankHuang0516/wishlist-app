import { isTransientUpstreamError, withTransientRetry } from '../lib/transientRetry';

describe('bounded upstream retry', () => {
    it.each([408, 429, 500, 502, 503, 504])('classifies HTTP %i as transient', status => {
        expect(isTransientUpstreamError({ status })).toBe(true);
    });

    it.each([400, 401, 403, 404, 422])('does not retry HTTP %i', async status => {
        const error = Object.assign(new Error('upstream rejected'), { status });
        const operation = jest.fn().mockRejectedValue(error);
        const sleep = jest.fn();
        await expect(withTransientRetry(operation, { sleep })).rejects.toBe(error);
        expect(operation).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('recovers from a 503 with exponential backoff and returns the actual result', async () => {
        const operation = jest.fn()
            .mockRejectedValueOnce({ status: 503 })
            .mockRejectedValueOnce({ status: 503 })
            .mockResolvedValueOnce({ name: 'actual product' });
        const sleep = jest.fn().mockResolvedValue(undefined);
        await expect(withTransientRetry(operation, { sleep, random: () => 0.5 }))
            .resolves.toEqual({ name: 'actual product' });
        expect(operation).toHaveBeenCalledTimes(3);
        expect(sleep.mock.calls).toEqual([[1125], [2125]]);
    });

    it('stops after three attempts and preserves the final error', async () => {
        const error = Object.assign(new Error('busy'), { status: 503 });
        const operation = jest.fn().mockRejectedValue(error);
        const sleep = jest.fn().mockResolvedValue(undefined);
        await expect(withTransientRetry(operation, { sleep })).rejects.toBe(error);
        expect(operation).toHaveBeenCalledTimes(3);
        expect(sleep).toHaveBeenCalledTimes(2);
    });

    it('does not infer retryability from error text or retry cancellations', async () => {
        for (const error of [new Error('503 in a URL'), { name: 'AbortError' }, null, '503']) {
            const operation = jest.fn().mockRejectedValue(error);
            await expect(withTransientRetry(operation)).rejects.toBe(error);
            expect(operation).toHaveBeenCalledTimes(1);
        }
    });

    it('does not delay successful inference', async () => {
        const sleep = jest.fn();
        await expect(withTransientRetry(async () => 'ok', { sleep })).resolves.toBe('ok');
        expect(sleep).not.toHaveBeenCalled();
    });

    it.each([0, -1, 1.5, 6, NaN])('rejects invalid attempt budgets (%s)', async maxAttempts => {
        const operation = jest.fn();
        await expect(withTransientRetry(operation, { maxAttempts })).rejects.toBeInstanceOf(RangeError);
        expect(operation).not.toHaveBeenCalled();
    });
});
