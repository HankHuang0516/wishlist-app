export function archiveGate(row: { originalPostedAt: Date | null; originalPostedEarliestAt?: Date | null; originalPostedLatestAt?: Date | null; verifiedAddress: string | null; addressEvidenceRef: string | null; verifiedLatitude: number | null; verifiedLongitude: number | null }, now = new Date()) {
    const taipeiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const [year, month, day] = taipeiDate.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, month - 3, 1));
    const end = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
    const cutoff = Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), Math.min(day, end)) - 8 * 3600000;
    const lower = row.originalPostedAt ?? row.originalPostedEarliestAt;
    const upper = row.originalPostedAt ?? row.originalPostedLatestAt;
    return !!lower && !!upper && lower <= upper && lower.getTime() >= cutoff && upper <= now &&
        !!row.verifiedAddress?.trim() && !!row.addressEvidenceRef?.trim() &&
        typeof row.verifiedLatitude === 'number' && Number.isFinite(row.verifiedLatitude) && row.verifiedLatitude >= 20 && row.verifiedLatitude <= 26.6 &&
        typeof row.verifiedLongitude === 'number' && Number.isFinite(row.verifiedLongitude) && row.verifiedLongitude >= 117 && row.verifiedLongitude <= 123.8;
}
