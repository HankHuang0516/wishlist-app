import { fork } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
const { startNativeQa, qaEnvironment } = require('../../../../mobile/scripts/native-qa.cjs');
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Identical isolated test DB required');
const worker = path.resolve(__dirname, '../../../../mobile/scripts/native-qa-worker.cjs');
const empty = { fixturesRemaining: 0, conversationsRemaining: 0, receiptsRemaining: 0, mediaTasksRemaining: 0, legacyTasksRemaining: 0, photoFoldersRemaining: 0 };
const ownedUsers: number[] = [];
function childFixture(env: NodeJS.ProcessEnv) {
    const child = fork(worker, [], { env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const messages: any[] = [];
    let readyResolve: (value: any) => void;
    const ready = new Promise<any>(resolve => { readyResolve = resolve; });
    child.on('message', message => {
        const data = message as any; messages.push(data);
        if (data.kind === 'ready') {
            ownedUsers.push(...Object.values(data.actors).map((actor: any) => actor.id));
            readyResolve(data);
        }
    });
    const exited = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    return { child, ready, exited, messages };
}
afterAll(async () => {
    // Verification first: never silently erase failed cleanup evidence.
    try { expect(await prisma.user.count({ where: { id: { in: ownedUsers } } })).toBe(0); }
    finally { await prisma.$disconnect(); }
});
describe('owned local QA process lifecycle and real isolated PostgreSQL', () => {
    it('refuses reporting another fixture owner even when the target UUID uses uppercase', async () => {
        const outsider = await prisma.user.create({ data: { phoneNumber: 'qa-report-unrelated-' + randomUUID(), password: 'synthetic-unused', isEmailVerified: true } });
        let qa: any;
        try {
            const now = new Date();
            const listing = await prisma.listing.create({ data: { ownerUserId: outsider.id, clientListingId: randomUUID(), requestHash: 'synthetic-fixture-only', title: '合成非本次QA商品', status: 'ACTIVE', publishedAt: now, expiresAt: new Date(now.getTime() + 86400000) } });
            qa = await startNativeQa(process.env.TEST_DATABASE_URL, 30);
            ownedUsers.push(...Object.values(qa.actors).map((actor: any) => actor.id));
            const login = await fetch(qa.apiUrl + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumber: qa.actors.buyer.email, password: qa.actors.buyer.password }), signal: AbortSignal.timeout(3000) });
            expect(login.status).toBe(200); const auth = await login.json() as any;
            const response = await fetch(qa.apiUrl + '/api/listing-reports', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token },
                body: JSON.stringify({ listingId: listing.id.toUpperCase(), clientReportId: randomUUID(), reason: 'OTHER' }), signal: AbortSignal.timeout(3000) });
            expect(response.status).toBe(403);
            expect(await prisma.listingReport.count({ where: { listingId: listing.id } })).toBe(0);
            expect(await qa.stop()).toEqual(empty);
            expect(await prisma.listing.findUnique({ where: { id: listing.id }, select: { ownerUserId: true } })).toEqual({ ownerUserId: outsider.id });
        } finally { if (qa) await qa.stop(); await prisma.user.delete({ where: { id: outsider.id } }); }
    });
    it('authenticates a synthetic actor through real login, then closes the listener and exactly cleans on repeated stop', async () => {
        const qa = await startNativeQa(process.env.TEST_DATABASE_URL, 30);
        ownedUsers.push(...Object.values(qa.actors).map((actor: any) => actor.id));
        try {
            expect(new URL(qa.apiUrl).hostname).toBe('127.0.0.1');
            const response = await fetch(qa.apiUrl + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: qa.actors.buyer.email, password: qa.actors.buyer.password }), signal: AbortSignal.timeout(3000) });
            expect(response.status).toBe(200);
            const auth = await response.json() as any;
            const profile = await fetch(qa.apiUrl + '/api/users/me', { headers: { Authorization: 'Bearer ' + auth.token }, signal: AbortSignal.timeout(3000) });
            expect(profile.status).toBe(200); expect((await profile.json() as any).id).toBe(qa.actors.buyer.id);
            expect(await qa.stop()).toEqual(empty); expect(await qa.stop()).toEqual(empty);
            await expect(fetch(qa.apiUrl + '/api/users/me', { signal: AbortSignal.timeout(1000) })).rejects.toThrow();
        } finally { await qa.stop(); }
    });
    it('automatically stops an expired service and cleans without another caller action', async () => {
        const qa = await startNativeQa(process.env.TEST_DATABASE_URL, 1);
        ownedUsers.push(...Object.values(qa.actors).map((actor: any) => actor.id));
        try { expect(await qa.exited).toEqual(empty); expect(await qa.stop()).toEqual(empty); }
        finally { await qa.stop(); }
    });
    it('cleans its three owned DB actors when its controlling IPC connection disappears', async () => {
        const run = childFixture(qaEnvironment(process.env.TEST_DATABASE_URL, 10));
        await run.ready;
        run.child.disconnect();
        expect(await run.exited).toBe(0);
        expect(await prisma.user.count({ where: { id: { in: ownedUsers } } })).toBe(0);
    });
    it('does not leave seeded users when stop arrives before readiness', async () => {
        const run = childFixture(qaEnvironment(process.env.TEST_DATABASE_URL, 10));
        run.child.send({ kind: 'stop' });
        expect(await run.exited).toBe(0);
        expect(run.messages.find(message => message.kind === 'stopped')?.summary).toEqual(empty);
    });
    it('fails closed before seeding if a provider credential is injected into the child', async () => {
        const before = await prisma.user.count({ where: { phoneNumber: { startsWith: 'native-qa-' } } });
        const run = childFixture({ ...qaEnvironment(process.env.TEST_DATABASE_URL, 10), RESEND_API_KEY: 'synthetic-forbidden-env' });
        expect(await run.exited).toBe(1);
        expect(run.messages.some(message => message.kind === 'ready')).toBe(false);
        expect(run.messages.find(message => message.kind === 'failed')).toMatchObject({ stage: 'launch-guard', unexpectedEnvironmentNames: ['RESEND_API_KEY'] });
        expect(await prisma.user.count({ where: { phoneNumber: { startsWith: 'native-qa-' } } })).toBe(before);
    });
    it('does not log in or erase an unrelated account in the same isolated test database', async () => {
        const uuid = randomUUID();
        const outsider = await prisma.user.create({ data: { phoneNumber: 'qa-unrelated-' + uuid, password: 'unused-synthetic', email: uuid + '@example.invalid' } });
        const qa = await startNativeQa(process.env.TEST_DATABASE_URL, 30);
        ownedUsers.push(...Object.values(qa.actors).map((actor: any) => actor.id));
        try {
            const response = await fetch(qa.apiUrl + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: outsider.email, password: 'unused-synthetic' }), signal: AbortSignal.timeout(3000) });
            expect(response.status).toBe(404);
            expect(await qa.stop()).toEqual(empty);
            expect(await prisma.user.findUnique({ where: { id: outsider.id }, select: { id: true } })).toEqual({ id: outsider.id });
        } finally {
            await qa.stop();
            await prisma.user.delete({ where: { id: outsider.id } });
        }
    });
});
