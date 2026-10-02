import { createHash } from 'crypto';
import type { ExternalSourceLead } from '@prisma/client';
import { archiveGate } from './sourceLeadDateGate';
import { TAIWAN_DISTRICTS } from './taiwanAdministrativeDistricts';
import { forbiddenListingField, privateContactField } from './listingPolicy';
export class LeadError extends Error {
}
const canonical = (v: any): any => v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const ref = (v: unknown): v is string => typeof v === 'string' && /^(?:self|review|source|consent):[A-Za-z0-9._/-]{4,180}$/.test(v);
export const object = (v: unknown): Record<string, any> => { if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new LeadError('INVALID_OBJECT'); return v as Record<string, any>; };
export function exact(v: Record<string, any>, keys: string[]) { if (Object.keys(v).some(k => !keys.includes(k)))
    throw new LeadError('UNEXPECTED_FIELD'); }
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
export function publicUrl(v: unknown, host?: string) {
    if (!text(v, 2048))
        throw new LeadError('INVALID_PUBLIC_URL');
    const u = new URL(v);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash || u.pathname === '/' || (host && u.hostname !== host))
        throw new LeadError('INVALID_PUBLIC_URL');
    // No private/loopback destinations. UI opens links only; backend never fetches them.
    if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(u.hostname) || /(?:^|\.)(?:localhost|local|internal)$/.test(u.hostname))
        throw new LeadError('INVALID_PUBLIC_URL');
    return u.href;
}
export function date(v: unknown) { if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v) || !Number.isFinite(Date.parse(v)))
    throw new LeadError('ORIGINAL_DATE_REQUIRED'); return new Date(v); }
export function parseLead(input: unknown, now = new Date()) {
    const b = object(input);
    exact(b, ['archiveItemId', 'libraryFileId', 'archiveVersion', 'archiveSha256', 'title', 'summary', 'canonicalUrl', 'county', 'district', 'publicPlaceName', 'publicAddress', 'latitude', 'longitude', 'postedEarliestAt', 'postedLatestAt', 'checkedAt', 'evidence']);
    const e = object(b.evidence);
    exact(e, ['sourceUrl', 'sourcePublic', 'publicSourceRef', 'dateRef', 'locationRef', 'coordinateRef', 'locationSourceUrl', 'coordinateSourceUrl', 'publicPlace', 'locationType', 'sourceMeetingPointConfirmed', 'independentlyReviewed', 'selfWrittenSummary', 'noCopiedTextOrImages', 'noPrivateData', 'reviewRef', 'publicFacts', 'coordinateNodeVersion']);
    if (!text(b.archiveItemId, 160) || !/^libfile_[a-f0-9]{32}$/.test(b.libraryFileId) || !Number.isSafeInteger(b.archiveVersion) || b.archiveVersion < 0 || !/^[a-f0-9]{64}$/.test(b.archiveSha256))
        throw new LeadError('ARCHIVE_IDENTITY_REQUIRED');
    const canonicalUrl = publicUrl(b.canonicalUrl);
    if (!text(b.title, 100) || !text(b.summary, 240) || forbiddenListingField({ title: b.title, description: b.summary }) || privateContactField({ title: b.title, description: b.summary }) || /https?:\/\/|@|(?:電話|手機|LINE|微信|帳號)\s*[:：]/i.test(b.title + ' ' + b.summary))
        throw new LeadError('SAFE_SELF_WRITTEN_FACTS_REQUIRED');
    if (!TAIWAN_DISTRICTS[b.county]?.has(b.district) || !text(b.publicPlaceName, 100) || !text(b.publicAddress, 200) || !b.publicAddress.replace(/^台/, '臺').startsWith(b.county + b.district) || b.publicAddress.slice((b.county + b.district).length).trim().length < 3)
        throw new LeadError('CONCRETE_PUBLIC_PLACE_REQUIRED');
    if ([b.publicPlaceName, b.publicAddress].some(v => privateContactField({ title: v }) || forbiddenListingField({ title: v })))
        throw new LeadError('SAFE_PUBLIC_PLACE_REQUIRED');
    const postedEarliestAt = date(b.postedEarliestAt), postedLatestAt = date(b.postedLatestAt), checkedAt = date(b.checkedAt);
    if (e.sourceUrl !== canonicalUrl || [e.sourcePublic, e.publicPlace, e.sourceMeetingPointConfirmed, e.independentlyReviewed, e.selfWrittenSummary, e.noCopiedTextOrImages, e.noPrivateData].some(v => v !== true) || e.locationType !== 'PUBLIC_MEETING_POINT' || ![e.publicSourceRef, e.dateRef, e.locationRef, e.coordinateRef, e.reviewRef].every(ref))
        throw new LeadError('BOUND_PUBLIC_EVIDENCE_REQUIRED');
    publicUrl(e.locationSourceUrl);
    publicUrl(e.coordinateSourceUrl);
    if (e.publicFacts !== undefined) {
        const f = object(e.publicFacts);
        exact(f, ['priceText', 'priceUnitStatus', 'currencyStatus', 'sourceAccessNotice', 'originalDateLabel', 'locationRelation', 'coordinateQualityNotes']);
        if (['priceText', 'priceUnitStatus', 'currencyStatus', 'sourceAccessNotice', 'originalDateLabel', 'locationRelation'].some(k => !text(f[k], 300)) || !Array.isArray(f.coordinateQualityNotes) || f.coordinateQualityNotes.length > 5 || f.coordinateQualityNotes.some((v: any) => !text(v, 500)) || [...Object.values(f).filter(v => typeof v === 'string'), ...f.coordinateQualityNotes].some(v => privateContactField({ title: String(v) }) || forbiddenListingField({ title: String(v) })))
            throw new LeadError('SAFE_PUBLIC_FACTS_REQUIRED');
    }
    if (e.coordinateNodeVersion !== undefined && (!Number.isSafeInteger(e.coordinateNodeVersion) || e.coordinateNodeVersion < 1 || !/^https:\/\/www\.openstreetmap\.org\/node\/\d+$/.test(e.coordinateSourceUrl)))
        throw new LeadError('OSM_PROVENANCE_REQUIRED');
    if (!archiveGate({ originalPostedAt: null, originalPostedEarliestAt: postedEarliestAt, originalPostedLatestAt: postedLatestAt, verifiedAddress: b.publicAddress, addressEvidenceRef: e.locationRef, verifiedLatitude: b.latitude, verifiedLongitude: b.longitude }, now) || checkedAt > now || now.getTime() - checkedAt.getTime() > 48 * 3600000)
        throw new LeadError('SOURCE_DATE_OR_LOCATION_EXPIRED');
    const facts = { title: b.title, summary: b.summary, canonicalUrl, county: b.county, district: b.district, publicPlaceName: b.publicPlaceName, publicAddress: b.publicAddress, latitude: b.latitude, longitude: b.longitude, postedEarliestAt, postedLatestAt };
    return { ...facts, archiveItemId: b.archiveItemId, libraryFileId: b.libraryFileId, archiveVersion: b.archiveVersion, archiveSha256: b.archiveSha256, checkedAt, evidence: e, contentHash: digest({ facts, e }) };
}
export function leadCurrent(row: ExternalSourceLead, now = new Date()) {
    if (row.status !== 'PUBLISHED')
        return false;
    try {
        const parsed = parseLead({ ...Object.fromEntries(['archiveItemId', 'libraryFileId', 'archiveVersion', 'archiveSha256', 'title', 'summary', 'canonicalUrl', 'county', 'district', 'publicPlaceName', 'publicAddress', 'latitude', 'longitude', 'evidence'].map(k => [k, (row as any)[k]])), postedEarliestAt: row.postedEarliestAt.toISOString(), postedLatestAt: row.postedLatestAt.toISOString(), checkedAt: row.checkedAt.toISOString() }, now);
        return parsed.contentHash === row.contentHash;
    }
    catch {
        return false;
    }
}
export function leadDTO(r: ExternalSourceLead) { return { id: r.id, kind: 'SOURCE_LEAD', title: r.title, summary: r.summary, canonicalUrl: r.canonicalUrl, county: r.county, district: r.district, publicPlaceName: r.publicPlaceName, publicAddress: r.publicAddress, latitude: r.latitude, longitude: r.longitude, postedEarliestAt: r.postedEarliestAt, postedLatestAt: r.postedLatestAt, checkedAt: r.checkedAt, stockStatus: 'UNKNOWN', qualifiedSupply: false, checkoutEnabled: false, publicFacts: object(r.evidence).publicFacts ?? null, coordinateSourceUrl: object(r.evidence).coordinateSourceUrl, coordinateAttribution: object(r.evidence).coordinateNodeVersion ? { text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL-1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/' } : null, notice: '來源線索，庫存與交易待確認；公共面交點不是賣家或商品所在位置。' }; }
export type LeadEvent = {
    requestId: string;
    action: string;
    text?: string;
    consent?: boolean;
    at: string;
    questionIds?: string[];
    payloadHash?: string;
};
export function transferSnapshot(lead: ExternalSourceLead, events: LeadEvent[]) { return { leadId: lead.id, contentHash: lead.contentHash, canonicalUrl: lead.canonicalUrl, questions: events.filter(e => e.action === 'ASK').map(e => ({ requestId: e.requestId, text: e.text })) }; }
export function routeCurrent(lead: ExternalSourceLead, now = new Date()) { try {
    const r = object(lead.sellerRoute);
    return r.leadId === lead.id && r.contentHash === lead.contentHash && r.sourceUrl === lead.canonicalUrl && ['FACEBOOK_UI', 'ECLAW', 'EMAIL'].includes(r.channel) && ref(r.identityEvidenceRef) && ref(r.routeEvidenceRef) && publicUrl(r.publicRouteUrl) && date(r.verifiedAt) <= now && now.getTime() - date(r.verifiedAt).getTime() < 24 * 3600000;
}
catch {
    return false;
} }
