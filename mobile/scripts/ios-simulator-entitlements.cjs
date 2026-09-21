// Simulator entitlements are linked into Mach-O, not necessarily the ad-hoc
// signature. Validate every architecture; reject malformed/unknown containers.
function simulatorEntitlements(binary) {
  const fail = () => { throw new Error('Invalid simulator entitlement container'); };
  const range = (start, length, limit = binary.length) => {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || start + length > limit) fail();
  };
  range(0, 8);
  let slices;
  if (binary.readUInt32BE(0) === 0xcafebabe) {
    const count = binary.readUInt32BE(4);
    if (count < 1 || count > 8) fail();
    range(8, count * 20);
    slices = Array.from({ length: count }, (_, index) => {
      const entry = 8 + index * 20;
      const start = binary.readUInt32BE(entry + 8), length = binary.readUInt32BE(entry + 12);
      if (start < 8 + count * 20) fail();
      range(start, length);
      return { start, length, cpu: binary.readUInt32BE(entry) };
    });
    const sorted = [...slices].sort((a, b) => a.start - b.start);
    if (sorted.some((slice, index) => index > 0 && slice.start < sorted[index - 1].start + sorted[index - 1].length)) fail();
  } else slices = [{ start: 0, length: binary.length }];
  const cpus = new Set();
  return slices.map(slice => {
    const { start, length } = slice, end = start + length;
    range(start, 32, end);
    if (binary.readUInt32LE(start) !== 0xfeedfacf || binary.readUInt32LE(start + 12) !== 2) fail();
    const cpu = binary.readUInt32LE(start + 4);
    if (![0x01000007, 0x0100000c].includes(cpu) || (slice.cpu !== undefined && cpu !== slice.cpu) || cpus.has(cpu)) fail();
    cpus.add(cpu);
    const commands = binary.readUInt32LE(start + 16), commandBytes = binary.readUInt32LE(start + 20);
    if (commands > 10000) fail();
    range(start + 32, commandBytes, end);
    const commandEnd = start + 32 + commandBytes;
    let cursor = start + 32, xml;
    for (let index = 0; index < commands; index++) {
      range(cursor, 8, commandEnd);
      const command = binary.readUInt32LE(cursor), size = binary.readUInt32LE(cursor + 4);
      if (size < 8) fail();
      range(cursor, size, commandEnd);
      if (command === 0x19) {
        if (size < 72) fail();
        const count = binary.readUInt32LE(cursor + 64);
        if (72 + count * 80 !== size) fail();
        for (let section = 0; section < count; section++) {
          const at = cursor + 72 + section * 80;
          const name = binary.subarray(at, at + 16).toString('ascii').replace(/\0.*$/, '');
          const segment = binary.subarray(at + 16, at + 32).toString('ascii').replace(/\0.*$/, '');
          if (name === '__entitlements' && segment === '__TEXT') {
            if (xml !== undefined) fail();
            const sectionSize = binary.readBigUInt64LE(at + 40), offset = binary.readUInt32LE(at + 48);
            if (sectionSize < 1n || sectionSize > 1048576n || offset < 32 + commandBytes) fail();
            range(start + offset, Number(sectionSize), end);
            xml = binary.subarray(start + offset, start + offset + Number(sectionSize)).toString('utf8').replace(/\0+$/, '');
            if (!xml.startsWith('<?xml') || !xml.includes('</plist>')) fail();
          }
        }
      }
      cursor += size;
    }
    if (cursor !== commandEnd || xml === undefined) fail();
    return { architecture: cpu === 0x0100000c ? 'arm64' : 'x86_64', xml };
  });
}
function assertSimulatorEntitlements(binary, expectedXml) {
  // Ignore only formatting between XML nodes. Whitespace inside a key/access
  // group changes its value and must never be normalized into an exact match.
  const normalized = value => value.trim().replace(/>[ \t\r\n]+</g, '><');
  const architectures = simulatorEntitlements(binary);
  if (architectures.some(item => normalized(item.xml) !== normalized(expectedXml))) throw new Error('Simulator entitlements differ from the unique QA access group');
  return architectures.map(item => item.architecture);
}
module.exports = { simulatorEntitlements, assertSimulatorEntitlements };
