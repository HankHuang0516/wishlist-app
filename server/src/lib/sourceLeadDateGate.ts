import { SOURCE_VALIDITY_MS } from './sourceValidity';
export function archiveGate(row: { originalPostedAt: Date | null; originalPostedEarliestAt?: Date | null; originalPostedLatestAt?: Date | null; verifiedAddress: string | null; addressEvidenceRef: string | null; verifiedLatitude: number | null; verifiedLongitude: number | null }, now = new Date(), ageLimit = true) {
    const lower = row.originalPostedAt ?? row.originalPostedEarliestAt;
    const upper = row.originalPostedAt ?? row.originalPostedLatestAt;
    return !!lower && !!upper && lower <= upper && (!ageLimit || lower.getTime() >= now.getTime() - SOURCE_VALIDITY_MS) && upper <= now &&
        !!row.verifiedAddress?.trim() && !!row.addressEvidenceRef?.trim() &&
        typeof row.verifiedLatitude === 'number' && Number.isFinite(row.verifiedLatitude) && row.verifiedLatitude >= 20 && row.verifiedLatitude <= 26.6 &&
        typeof row.verifiedLongitude === 'number' && Number.isFinite(row.verifiedLongitude) && row.verifiedLongitude >= 117 && row.verifiedLongitude <= 123.8;
}
