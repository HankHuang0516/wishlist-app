const { simulatorEntitlements, assertSimulatorEntitlements } = require('../../../mobile/scripts/ios-simulator-entitlements.cjs');
const xml = '<?xml version="1.0"?><plist version="1.0"><dict><key>keychain-access-groups</key><array><string>team.unique.qa</string></array></dict></plist>';
function thin(cpu = 0x0100000c, value = xml) {
    const data = Buffer.from(value), binary = Buffer.alloc(184 + data.length);
    binary.writeUInt32LE(0xfeedfacf, 0); binary.writeUInt32LE(cpu, 4); binary.writeUInt32LE(2, 12);
    binary.writeUInt32LE(1, 16); binary.writeUInt32LE(152, 20);
    binary.writeUInt32LE(0x19, 32); binary.writeUInt32LE(152, 36); binary.writeUInt32LE(1, 96);
    binary.write('__entitlements', 104); binary.write('__TEXT', 120);
    binary.writeBigUInt64LE(BigInt(data.length), 144); binary.writeUInt32LE(184, 152); data.copy(binary, 184);
    return binary;
}
function fat(parts = [thin(0x01000007), thin()]) {
    const header = 8 + parts.length * 20;
    const binary = Buffer.alloc(header + parts.reduce((sum, item) => sum + item.length, 0));
    binary.writeUInt32BE(0xcafebabe, 0); binary.writeUInt32BE(parts.length, 4);
    let offset = header;
    parts.forEach((item, index) => {
        const at = 8 + index * 20;
        binary.writeUInt32BE(item.readUInt32LE(4), at); binary.writeUInt32BE(offset, at + 8); binary.writeUInt32BE(item.length, at + 12);
        item.copy(binary, offset); offset += item.length;
    });
    return binary;
}
describe('all-architecture simulator entitlement isolation', () => {
    it('reads arm64 linked entitlements instead of trusting the empty ad-hoc signature', () => {
        expect(simulatorEntitlements(thin())).toEqual([{ architecture: 'arm64', xml }]);
    });
    it('validates both architectures in the actual universal container format', () => {
        expect(assertSimulatorEntitlements(fat(), xml)).toEqual(['x86_64', 'arm64']);
    });
    it('permits XML formatting whitespace without changing the expected content', () => {
        expect(assertSimulatorEntitlements(thin(), xml.replace(/></g, '>\n<'))).toEqual(['arm64']);
    });
    it('rejects any architecture using the original or an extra access group', () => {
        expect(() => assertSimulatorEntitlements(fat([thin(0x01000007), thin(0x0100000c, xml.replace('team.unique.qa', 'team.original'))]), xml)).toThrow();
        expect(() => assertSimulatorEntitlements(thin(0x0100000c, xml.replace('</array>', '<string>team.original</string></array>')), xml)).toThrow();
    });
    it.each(['team.unique. qa', 'team.unique.qa '])('does not hide value-changing whitespace in %s', group => {
        expect(() => assertSimulatorEntitlements(thin(0x0100000c, xml.replace('team.unique.qa', group)), xml)).toThrow();
    });
    it.each(['magic', 'cpu', 'filetype', 'command-size', 'command-bytes', 'section-count', 'section-offset', 'section-size', 'section-name', 'segment-name'])('rejects malformed thin %s', field => {
        const binary = thin();
        const mutations: Record<string, () => void> = {
            magic: () => binary.writeUInt32LE(0, 0), cpu: () => binary.writeUInt32LE(7, 4), filetype: () => binary.writeUInt32LE(6, 12),
            'command-size': () => binary.writeUInt32LE(0, 36), 'command-bytes': () => binary.writeUInt32LE(0xffffffff, 20),
            'section-count': () => binary.writeUInt32LE(2, 96), 'section-offset': () => binary.writeUInt32LE(4, 152),
            'section-size': () => binary.writeBigUInt64LE(BigInt(1048577), 144), 'section-name': () => binary.write('bad', 104),
            'segment-name': () => binary.write('bad', 120),
        };
        mutations[field](); expect(() => simulatorEntitlements(binary)).toThrow();
    });
    it.each(['zero-count', 'overlap', 'out-of-bounds', 'cpu-mismatch', 'duplicate-cpu'])('rejects malformed universal %s', field => {
        const binary = field === 'duplicate-cpu' ? fat([thin(), thin()]) : fat();
        if (field === 'zero-count') binary.writeUInt32BE(0, 4);
        if (field === 'overlap') binary.writeUInt32BE(48, 36);
        if (field === 'out-of-bounds') binary.writeUInt32BE(0xffffffff, 20);
        if (field === 'cpu-mismatch') binary.writeUInt32BE(0x0100000c, 8);
        expect(() => simulatorEntitlements(binary)).toThrow();
    });
    it.each([Buffer.alloc(0), Buffer.alloc(7), thin().subarray(0, 80)])('rejects truncated containers without returning a partial proof', binary => {
        expect(() => simulatorEntitlements(binary)).toThrow();
    });
});
