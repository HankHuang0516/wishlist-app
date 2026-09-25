import type { ExternalListingCandidate, ExternalListingSource } from '@prisma/client';
import { parseExternalCandidate } from './externalListingIntake';

export type PublicCandidateFacts = Pick<ExternalListingCandidate, 'sourceItemId' | 'canonicalUrl' | 'imageUrl' | 'title' |
    'thumbnailUrl' | 'description' | 'priceTwd' | 'condition' | 'county' | 'district' | 'observedAt' | 'expiresAt' | 'contentHash'>;
export type PublicSourcePolicy = Pick<ExternalListingSource, 'enabled' | 'enabledAt' | 'textReuseAllowed' |
    'imageReuseAllowed' | 'authorizationRef' | 'canonicalHost' | 'imageHost'>;

// Revalidate the current sourced facts before approval AND before every public
// read. Approval is not a replacement for current rights, freshness or a
// content-hash match. Area names are not a seller's precise location.
export function eligibleExternalCandidate(row: PublicCandidateFacts, source: PublicSourcePolicy, now = new Date()) {
    if (!source.enabled || !source.enabledAt || !source.textReuseAllowed || !source.imageReuseAllowed ||
        !row.imageUrl || !row.thumbnailUrl || !row.description || row.condition !== 'USED' || row.priceTwd === null ||
        !/^(?:contract|consent|license|self):[A-Za-z0-9._/-]{4,160}$/.test(source.authorizationRef)) return false;
    try {
        const parsed = parseExternalCandidate({ sourceItemId: row.sourceItemId, canonicalUrl: row.canonicalUrl,
            imageUrl: row.imageUrl, thumbnailUrl: row.thumbnailUrl, title: row.title,
            description: row.description, priceTwd: row.priceTwd.toNumber(),
            condition: row.condition, county: row.county, district: row.district,
            observedAt: row.observedAt.toISOString(), expiresAt: row.expiresAt.toISOString() }, source, now);
        return parsed.contentHash === row.contentHash;
    } catch { return false; }
}
