import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {decodeEvidenceBytes,evidenceSha,parseRegistryManifest,registryEntryFromFiles,registryIssue} from './sourceReferenceRegistryData';
beforeEach(()=>vi.stubGlobal('crypto',webcrypto));afterEach(()=>vi.unstubAllGlobals());
const source=()=>JSON.stringify({actualCheckedAt:'2026-10-12T14:41:39.334Z',source:{canonicalUrl:'https://example.invalid/source/1',originalPostedDisplay:'2026年9月30日 星期三上午3:42',originalPostedTimeZone:'unknown',exactOriginalPostedAtUtc:null},publicMeetingPoint:{county:'臺南市',district:'永康區',publicAddress:'合成公共地址',normalizedPlaceName:'合成公共點'},items:[{sourceKey:'SYNTHETIC-1',name:'合成熱水瓶',summary:'自寫合成摘要',sourceMarkedPrice:{amount:750,currency:'TWD'},adminRecord:{existingPostedEarliestAt:'2026-09-29T02:25:44.000Z',existingPostedLatestAt:'2026-10-02T02:25:44.000Z'}}]})+'\n';
const doc={id:'11111111-1111-4111-8111-111111111111',archiveItemId:'SYNTHETIC-1',canonicalUrl:'https://example.invalid/source/1',title:'舊合成名稱',summary:'旧摘要',latitude:23,longitude:120.236,sourceClaimState:'UNKNOWN',evidence:{coordinateSourceUrl:'https://www.openstreetmap.org/node/1',coordinateNodeVersion:2}};
describe('exact non-secret browser evidence input',()=>{
 it('UTF8 import preserves CRLF and trailing LF rather than reserializing original bytes',async()=>{const raw=source().replaceAll('\n','\r\n'),bytes=new TextEncoder().encode(raw);expect(decodeEvidenceBytes(bytes.buffer as ArrayBuffer,50000)).toBe(raw);expect(await evidenceSha(raw)).not.toBe(await evidenceSha(raw.trim()));expect(()=>decodeEvidenceBytes(new Uint8Array([255]).buffer,100)).toThrow();});
 it('file binding uses actual source checkedAt, conservative original bounds and API XML URL without inventing coords or server receipts',async()=>{
  const raw=source(),xml='<osm><node id="1" version="2" lat="23" lon="120.236"><tag k="addr:district" v="東區"/></node></osm>\n';
  const coords=JSON.stringify({httpRead:{serverIssuedReceipt:false,completedAt:'2026-10-12T16:49:48.136Z',sha256:await evidenceSha(xml)},coordinateEvidence:{sourceUrl:'https://api.openstreetmap.org/api/0.6/node/1',nodeXml:xml}});
  const entry=await registryEntryFromFiles(doc,raw,coords,'source:library/synthetic-receipt',await evidenceSha(raw),await evidenceSha(xml));
  expect(entry.facts.checkedAt).toBe('2026-10-12T14:41:39.334Z');expect(entry.facts.postedEarliestAt).toBe('2026-09-29T02:25:44.000Z');expect(entry.facts.evidence.publicFacts.originalDateLabel).toContain('時區未知');expect(entry.facts.latitude).toBe(23);expect(entry.coordinateEvidence?.sourceUrl).toBe('https://api.openstreetmap.org/api/0.6/node/1');expect(entry.coordinateEvidence?.nodeXml).toBe(xml);expect(entry.sourceReceiptJson).toBe(raw);
  await expect(registryEntryFromFiles(doc,raw,coords,'source:library/synthetic-receipt','0'.repeat(64))).rejects.toThrow('SOURCE_RECEIPT_HASH_MISMATCH');
 });
 it('does not normalize an original receipt, accept21 entries or accept forged issuer/verified flags',async()=>{
  const raw=source(),entry={archiveItemId:'SYNTHETIC-1',facts:{evidence:{sourceCheckRef:'source:'+await evidenceSha(raw)}},sourceReceiptJson:raw};
  expect(await parseRegistryManifest(JSON.stringify({entries:[entry]}))).toHaveLength(1);
  await expect(parseRegistryManifest(JSON.stringify({entries:[{...entry,sourceReceiptJson:raw.trim()}]}))).rejects.toThrow('SOURCE_RECEIPT_HASH_MISMATCH');
  await expect(parseRegistryManifest(JSON.stringify({entries:[{...entry,verified:true}]}))).rejects.toThrow('UNSUPPORTED_EVIDENCE_FIELDS');
  await expect(parseRegistryManifest(JSON.stringify({entries:Array.from({length:21},()=>entry)}))).rejects.toThrow('ONE_TO_20');
  await expect(parseRegistryManifest('{"entries":[],"apiKey":"never-upload"}')).rejects.toThrow('BOUNDED_NON_SECRET');
  expect(registryIssue('PUBLIC_COORDINATE_ADMINISTRATIVE_CONFLICT')).toContain('衝突');expect(registryIssue('private raw diagnostic fixture')).not.toContain('private');
 });
});
