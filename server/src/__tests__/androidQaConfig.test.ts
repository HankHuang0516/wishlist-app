const { qaLabel, qaPackage, hostEnvironment, metroArguments, assignedSerial, ORIGINAL_PACKAGE, METRO_PORT, buyerErasureProof } = require('../../../mobile/scripts/android-qa-config.cjs');
const { androidQaSources } = require('../../../mobile/scripts/android-qa-sources.cjs');
const path = require('node:path');
describe('Android native QA build and lease boundaries', () => {
    it('keeps the Debug-only app build independent of the missing instrumentation source', () => {
        const sources: string[] = androidQaSources(path.resolve(__dirname, '../../../mobile'), { includeInstrumentation: false });
        expect(sources).toContain('scripts/build-android-debug-qa.cjs');
        expect(sources).toContain('android/app/build.gradle');
        expect(sources).toContain('src/ExploreScreen.tsx');
        expect(sources.some(source => source.endsWith('/NativeQaTest.kt'))).toBe(false);
        expect(new Set(sources).size).toBe(sources.length);
    });
    it('separates a unique local QA identity from the unchanged store identity', () => {
        expect(qaPackage('202609152101')).toBe(ORIGINAL_PACKAGE + '.qa202609152101');
        expect(METRO_PORT).toBe(18887);
    });
    it.each([undefined, '', 'qa', '20260915', '202609152101release', '../release', 202609152101])('rejects an unsafe/nonunique build label %p', value => {
        expect(() => qaLabel(value)).toThrow();
    });
    it('constructs a clean host environment without inheriting production/Node injection settings', () => {
        expect(hostEnvironment('/runtime/bin/node', '/java', '/sdk', '/actual-home')).toEqual({
            PATH: '/runtime/bin:/java/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', HOME: '/actual-home',
            JAVA_HOME: '/java', ANDROID_HOME: '/sdk', ANDROID_SDK_ROOT: '/sdk',
            NODE_ENV: 'development', EXPO_NO_DOTENV: '1', EXPO_OFFLINE: '1', CI: '1', TZ: 'Asia/Taipei',
        });
    });
    it('keeps localhost binding separate from the offline CLI setting', () => {
        const args = metroArguments('/mobile');
        expect(args).toEqual(['--dns-result-order=ipv4first', '/mobile/node_modules/expo/bin/cli', 'start', '--localhost',
            '--port', '18887', '--max-workers', '2']);
        expect(args).not.toContain('--offline');
        expect(hostEnvironment('/node', '/java', '/sdk', '/actual-home').EXPO_OFFLINE).toBe('1');
    });
    it.each([{}, { SIM_MANAGER_SERIAL: 'emulator-5566' }, { SIM_MANAGER_TOKEN: 'lease', SIM_MANAGER_SERIAL: 'booted' },
        { SIM_MANAGER_TOKEN: 'lease', SIM_MANAGER_SERIAL: 'other-device' }, { SIM_MANAGER_TOKEN: 'lease', SIM_MANAGER_SERIAL: 'emulator-5566;erase' }])('rejects an implicit/unassigned target %p', env => {
        expect(() => assignedSerial(env)).toThrow();
    });
    it('uses only the supervisor-assigned serial', () => {
        expect(assignedSerial({ SIM_MANAGER_TOKEN: 'actual-lease', SIM_MANAGER_SERIAL: 'emulator-5566' })).toBe('emulator-5566');
    });
    const actors = [{ id: 101 }, { id: 102 }, { id: 103 }];
    const live = { ended: false, stopping: false, now: 100000, deadline: 200000 };
    it('proves only buyer erasure while both other live fixtures remain', () => {
        expect(buyerErasureProof(actors, [{ id: 103 }, { id: 102 }], live)).toBe(true);
    });
    it.each([[], [{ id: 101 }, { id: 102 }, { id: 103 }], [{ id: 101 }, { id: 102 }], [{ id: 102 }],
        [{ id: 102 }, { id: 102 }], [{ id: 102 }, { id: 999 }]].map(rows => ({ rows })))('does not mistake missing/incorrect fixtures for erasure: %p', ({ rows }) => {
        expect(buyerErasureProof(actors, rows, live)).toBe(false);
    });
    it.each([{ ...live, ended: true }, { ...live, stopping: true }, { ...live, now: 170000 }, { ...live, now: NaN },
        { ...live, deadline: undefined }, { ...live, ended: undefined }])('rejects expiry/cleanup/unknown lifecycle observations: %p', observation => {
        expect(buyerErasureProof(actors, [{ id: 102 }, { id: 103 }], observation)).toBe(false);
    });
    it.each([[{ id: 101 }, { id: 102 }, { id: 102 }], [{ id: 0 }, { id: 102 }, { id: 103 }], [{ id: '101' }, { id: 102 }, { id: 103 }]].map(values => ({ values })))('rejects invalid/non-distinct isolated actors: %p', ({ values }) => {
        expect(buyerErasureProof(values, [{ id: 102 }, { id: 103 }], live)).toBe(false);
    });
});
