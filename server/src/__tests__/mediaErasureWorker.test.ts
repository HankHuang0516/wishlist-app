import { startMediaErasureWorker } from '../lib/mediaErasureWorker';
jest.mock('../lib/accountErasure', () => ({ drainMediaErasureTasks: jest.fn().mockResolvedValue({ completed: 0 }) }));
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
describe('bounded durable media-erasure retry scheduler', () => {
    it('runs once immediately, then every 30 seconds, with no overlapping drain', async () => {
        let release!: () => void;
        const run = jest.fn(() => new Promise<void>(resolve => { release = resolve; }));
        const stop = startMediaErasureWorker(run);
        expect(run).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(90000); expect(run).toHaveBeenCalledTimes(1);
        release(); await settle();
        jest.advanceTimersByTime(30000); expect(run).toHaveBeenCalledTimes(2);
        stop(); release(); await settle();
    });
    it('reports no exception details and retries after a failure', async () => {
        const run = jest.fn().mockRejectedValue(new Error('synthetic-private-path')), report = jest.fn();
        const stop = startMediaErasureWorker(run, report); await settle();
        expect(report).toHaveBeenCalledWith();
        jest.advanceTimersByTime(30000); await settle(); expect(run).toHaveBeenCalledTimes(2);
        stop();
    });
    it('stops future scheduling without cancelling or pretending to finish active work', async () => {
        let release!: () => void;
        const run = jest.fn(() => new Promise<void>(resolve => { release = resolve; }));
        const stop = startMediaErasureWorker(run); stop(); stop();
        jest.advanceTimersByTime(120000); expect(run).toHaveBeenCalledTimes(1);
        release(); await settle(); jest.advanceTimersByTime(120000); expect(run).toHaveBeenCalledTimes(1);
    });
});
