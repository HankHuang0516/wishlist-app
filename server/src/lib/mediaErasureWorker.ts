import { drainMediaErasureTasks } from './accountErasure';

/** One bounded drain per worker at a time; database row locks coordinate hosts.
 * Stop only prevents future cycles, never claims cancellation of an active one.
 */
export function startMediaErasureWorker(
    run: () => Promise<unknown> = () => drainMediaErasureTasks(),
    report: () => void = () => console.error('Private photo erasure retry unavailable; identities and paths withheld'),
) {
    let running = false, stopped = false;
    async function cycle() {
        if (stopped || running) return;
        running = true;
        try { await run(); } catch { report(); } finally { running = false; }
    }
    const timer = setInterval(() => void cycle(), 30000);
    timer.unref();
    void cycle();
    return () => { stopped = true; clearInterval(timer); };
}
