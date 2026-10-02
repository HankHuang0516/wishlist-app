import { createHash } from 'crypto';
export class FollowOperationError extends Error {
    constructor(public status = 400) { super('Follow operation rejected'); }
}
export function followUserId(value: unknown): number {
    if (typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value)) value = Number(value);
    if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 2147483647) throw new FollowOperationError();
    return Number(value);
}
export function followActionId(value: unknown): string {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new FollowOperationError();
    return value;
}
export function followInput(value: unknown, userId: number) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'expectedVersion,targetUserId,wanted') throw new FollowOperationError();
    const row = value as Record<string,unknown>, targetUserId = followUserId(row.targetUserId);
    if (typeof row.targetUserId !== 'number' || targetUserId === userId || typeof row.wanted !== 'boolean' || !Number.isSafeInteger(row.expectedVersion) || Number(row.expectedVersion) < 0 || Number(row.expectedVersion) >= 2147483647) throw new FollowOperationError();
    return { targetUserId, wanted: row.wanted, expectedVersion: Number(row.expectedVersion) };
}
export const followHash = (input: ReturnType<typeof followInput>) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
