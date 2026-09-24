import { recognizeImage } from './server.mjs';

const API = process.env.WISHLIST_MINIMAX_API_URL || 'https://wishlist-app-production.up.railway.app/api';
const token = process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN;
const once = process.argv.includes('--once');

if (!token || token.length < 32) throw new Error('WISHLIST_MINIMAX_CALLBACK_TOKEN must be configured locally');
if (!/^https:\/\/[a-z0-9.-]+\/api$/i.test(API)) throw new Error('WISHLIST_MINIMAX_API_URL must be an HTTPS API origin');

async function api(path, init = {}) {
    const response = await fetch(`${API}/internal/minimax-vision${path}`, { ...init, redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(20_000) });
    return response;
}

async function cycle() {
    const response = await api('/next');
    if (response.status === 204) return false;
    if (!response.ok) throw new Error(`POLL_HTTP_${response.status}`);
    const job = await response.json();
    if (!/^[0-9a-f-]{36}$/.test(job.jobId) || typeof job.imageUrl !== 'string') throw new Error('POLL_BAD_JOB');
    let body;
    try { body = { status: 'COMPLETED', result: await recognizeImage(job.imageUrl) }; }
    catch (error) {
        process.stderr.write(`MiniMax image recognition failed for job ${job.jobId}: ${String(error?.message || 'VISION_UNAVAILABLE')}\n`);
        body = { status: 'FAILED' };
    }
    const delivered = await api(`/${job.jobId}/result`, { method: 'POST', body: JSON.stringify(body) });
    if (delivered.status !== 204) throw new Error(`CALLBACK_HTTP_${delivered.status}`);
    process.stdout.write(`MiniMax vision job ${job.jobId}: ${body.status}\n`);
    return true;
}

do {
    try {
        const worked = await cycle();
        if (once) break;
        if (!worked) await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
        process.stderr.write(`MiniMax pilot poll unavailable: ${String(error?.message || error)}\n`);
        if (once) process.exitCode = 1;
        else await new Promise(resolve => setTimeout(resolve, 10000));
    }
} while (!once);
