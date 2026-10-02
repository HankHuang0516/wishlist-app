#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function assertDemoReady(snapshot, now = Date.now()) {
    assert.equal(snapshot.userId, snapshot.expectedUserId, 'Review login must use the intended demo identity');
    assert(snapshot.wishCount >= 2, 'Prepopulate at least two wishes');
    assert(snapshot.ownListings.some(l => l.status === 'ACTIVE' && Date.parse(l.expiresAt) > now && l.media?.length), 'Demo needs an active own listing with photos');
    const rooms = snapshot.rooms.filter(r => !r.archived && !r.blocked && r.listingAvailable &&
        r.messages.some(m => m.senderUserId === r.buyerUserId && m.text?.trim()) &&
        r.messages.some(m => m.senderUserId === r.sellerUserId && m.text?.trim()));
    assert(rooms.some(r => r.buyerUserId === snapshot.userId), 'Demo must show buyer chat with replies');
    assert(rooms.some(r => r.sellerUserId === snapshot.userId), 'Demo must show seller chat with replies');
    assert(rooms.some(r => r.appointment?.status === 'CONFIRMED' && Date.parse(r.appointment.startsAt) > now), 'Demo needs a future confirmed meetup');
    assert(rooms.some(r => r.appointment?.status === 'PROPOSED' && Date.parse(r.appointment.startsAt) > now), 'Demo needs a future proposed meetup');
    assert.equal(snapshot.marketing.available, true, 'Review account must have free AI feature access');
    assert.equal(snapshot.marketing.paidPurchasesAvailable, false, 'Reassess business answers before enabling payments');
    assert.equal(snapshot.marketing.freeMonthlyLimit, 3, 'Reassess business answers if free limits change');
    assert(snapshot.marketing.freeUsedThisMonth < 3, 'Leave free generations available to the reviewer');
    assert.equal(snapshot.iapCount, 0, 'Update business answers for any IAP product');
    assert.equal(snapshot.subscriptionCount, 0, 'Update business answers for any subscription');
    for (let i = 1; i <= 5; i++) assert(new RegExp(`Business model Q${i}:\\s+\\S`).test(snapshot.notes), `Missing business answer ${i}`);
}

function asc(...args) {
    return JSON.parse(execFileSync('asc', ['--profile', 'Hank App Store Release', ...args],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}
async function checkLive(versionId, expectedUserId) {
    const { APP_CONSTANTS } = require('../server/dist/config/constants.js');
    const details = asc('review', 'details-for-version', '--version-id', versionId, '--include-sensitive').data.attributes;
    assert(details.demoAccountRequired && details.demoAccountName && details.demoAccountPassword, 'Missing actual App Store review credentials');
    assert(details.demoAccountName.endsWith('@example.invalid'), 'Use an isolated synthetic review account');
    async function api(path, token, body) {
        const response = await fetch(APP_CONSTANTS.DEFAULT_API_URL + path, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
        assert(response.ok, `Review API ${path.split('?')[0]} failed with HTTP ${response.status}`);
        return response.json();
    }
    const login = await api('/auth/login', null, { phoneNumber: details.demoAccountName, password: details.demoAccountPassword });
    assert.equal(login.user?.id, expectedUserId, 'Unexpected actual review account');
    const lists = await api('/wishlists', login.token);
    const inbox = await api('/chat/conversations?limit=100', login.token);
    const rooms = [];
    for (const room of inbox.items) rooms.push({ ...room,
        messages: (await api(`/chat/conversations/${room.id}/messages?limit=100`, login.token)).items,
        appointment: (await api(`/chat/conversations/${room.id}/meetup`, login.token)).appointment });
    const snapshot = { expectedUserId, userId: login.user.id,
        wishCount: lists.reduce((n, l) => n + (l.items?.length || 0), 0),
        ownListings: (await api('/listings/mine?limit=100', login.token)).items, rooms,
        marketing: await api('/marketing/availability', login.token), notes: details.notes || '',
        iapCount: asc('iap', 'list', '--app', '6468950847', '--paginate').data.length,
        subscriptionCount: asc('subscriptions', 'list', '--app', '6468950847', '--paginate').data.length };
    assertDemoReady(snapshot);
    return { checkedAt: new Date().toISOString(), versionId, demoUserId: login.user.id,
        wishCount: snapshot.wishCount, conversationCount: rooms.length, freeGenerationsRemaining: 3 - snapshot.marketing.freeUsedThisMonth };
}

async function main() {
    const args = process.argv.slice(2);
    const get = name => args[args.indexOf(name) + 1];
    assert(args.includes('--version-id') && args.includes('--demo-user-id'), 'Required: --version-id ID --demo-user-id ID');
    const id = Number(get('--demo-user-id'));
    assert(Number.isSafeInteger(id) && id > 0, 'Invalid demo user ID');
    const result = await checkLive(get('--version-id'), id);
    if (args.includes('--submit')) {
        assert(args.includes('--submission-id') && args.includes('--item-id') && args.includes('--ui-receipt'), 'Submission requires item, submission and native UI evidence');
        const receipt = JSON.parse(fs.readFileSync(get('--ui-receipt'), 'utf8'));
        assert.equal(receipt.versionId, result.versionId);
        assert.equal(receipt.demoUserId, id);
        assert.equal(receipt.sceneLifecycleVerified, true);
        assert(receipt.buildId && receipt.buildNumber && receipt.artifactSha256);
        assert(Date.parse(receipt.verifiedAt) > Date.now() - 24 * 60 * 60 * 1000, 'Native UI verification is stale');
        for (const step of ['login', 'socialInbox', 'buyerChat', 'sellerChat', 'meetup', 'wishes', 'account'])
            assert.equal(receipt.checks[step], true, `Missing native UI check ${step}`);
        const version = asc('versions', 'view', '--version-id', result.versionId, '--include-build');
        assert.equal(version.data.relationships.build.data.id, receipt.buildId, 'Native proof must match the selected build');
        asc('validate', '--app', '6468950847', '--version-id', result.versionId);
        asc('review', 'items-update', '--id', get('--item-id'), '--resolved', 'true');
        asc('review', 'submissions-submit', '--id', get('--submission-id'), '--confirm');
        result.submitted = true;
    }
    console.log(JSON.stringify(result, null, 2));
}
module.exports = { assertDemoReady, checkLive };
if (require.main === module) main().catch(error => {
    // Never print raw CLI output, credentials, tokens or an HTTP response body.
    console.error(error instanceof assert.AssertionError ? error.message : 'App Review preflight failed; inspect the relevant service securely.');
    process.exitCode = 1;
});
