import { randomUUID, randomBytes } from 'node:crypto';
const { credentialFreeResultLogs } = require('../../../mobile/scripts/ios-qa-result-privacy.cjs');
const { AUTHENTICATED_TESTS, AUTHENTICATED_DELETION_TESTS } = require('../../../mobile/scripts/ios-xctestrun-config.cjs');
const udid = '95C7B0D3-4770-4E5C-9567-7304A7408881';
const seed = () => {
    const actor = { email: randomUUID() + '-buyer@example.invalid', password: 'Qa' + randomBytes(16).toString('hex') + '123' };
    const consoleLog: any = { sdkConsoleUnavailable: true };
    const action: any = { domainType: 'com.apple.dt.unit.cocoaUnitTest', subsections: [{ title: 'native test action', testDetails: { emittedOutput: 'safe stages only' } }] };
    const activities: any = AUTHENTICATED_TESTS.map((method: string) => ({ testIdentifierURL: 'test://com.apple.xcode/WishlistNativeQa/WishlistNativeQa/' + method,
        testRuns: [{ device: { deviceId: udid }, activities: [{ title: 'safe native activity' }] }] }));
    return { actor, consoleLog, action, activities };
};
describe('complete exported iOS result privacy evidence', () => {
    it('audits the full Test action and exact single-run marketplace activity tree when SDK explicitly has no separate console', () => {
        const value = seed(); expect(credentialFreeResultLogs(value.consoleLog, value.action, value.actor, value.activities, udid)).toBe(true);
    });
    it('also audits a separately available SDK console', () => {
        const value = seed(); expect(credentialFreeResultLogs({ items: [{ content: 'safe' }] }, value.action, value.actor, value.activities, udid)).toBe(true);
    });
    it('audits the independent deletion method only when its exact expected test list is supplied', () => {
        const value = seed();
        value.activities = AUTHENTICATED_DELETION_TESTS.map((method: string) => ({ testIdentifierURL: 'test://com.apple.xcode/WishlistNativeQa/WishlistNativeQa/' + method,
            testRuns: [{ device: { deviceId: udid }, activities: [{ title: 'safe native activity' }] }] }));
        expect(credentialFreeResultLogs(value.consoleLog, value.action, value.actor, value.activities, udid, AUTHENTICATED_DELETION_TESTS)).toBe(true);
        expect(credentialFreeResultLogs(value.consoleLog, value.action, value.actor, value.activities, udid)).toBe(false);
    });
    it.each(['raw-email', 'raw-password', 'encoded-email', 'base64-utf8', 'base64-utf16', 'activity', 'object-key'])('rejects credential material in %s', field => {
        const value = seed();
        if (field === 'raw-email') value.action.subsections[0].testDetails.emittedOutput = value.actor.email;
        if (field === 'raw-password') value.consoleLog = { items: [{ content: value.actor.password }] };
        if (field === 'encoded-email') value.action.subtitle = encodeURIComponent(value.actor.email);
        if (field === 'base64-utf8') value.action.attachments = [{ data: Buffer.from(value.actor.password).toString('base64') }];
        if (field === 'base64-utf16') value.action.attachments = [{ data: Buffer.from(value.actor.email, 'utf16le').toString('base64') }];
        if (field === 'activity') value.activities[value.activities.length - 1].testRuns[0].activities[0].title = value.actor.email;
        if (field === 'object-key') value.action[value.actor.password] = true;
        expect(credentialFreeResultLogs(value.consoleLog, value.action, value.actor, value.activities, udid)).toBe(false);
    });
    it.each(['missing-console', 'unknown-console', 'missing-action', 'wrong-action', 'missing-activities', 'missing-case', 'wrong-case', 'repeated-run', 'foreign-device', 'empty-activity'])('rejects incomplete or foreign %s evidence', field => {
        const value = seed();
        if (field === 'missing-console') value.consoleLog = null;
        if (field === 'unknown-console') value.consoleLog = {};
        if (field === 'missing-action') value.action = null;
        if (field === 'wrong-action') value.action.domainType = 'Run action';
        if (field === 'missing-activities') value.activities = null;
        if (field === 'missing-case') value.activities.pop();
        if (field === 'wrong-case') value.activities[0].testIdentifierURL = 'test://foreign';
        if (field === 'repeated-run') value.activities[0].testRuns.push(value.activities[0].testRuns[0]);
        if (field === 'foreign-device') value.activities[0].testRuns[0].device.deviceId = 'foreign';
        if (field === 'empty-activity') value.activities[0].testRuns[0].activities = [];
        expect(credentialFreeResultLogs(value.consoleLog, value.action, value.actor, value.activities, udid)).toBe(false);
    });
});
