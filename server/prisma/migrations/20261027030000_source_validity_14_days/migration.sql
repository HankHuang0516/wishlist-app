-- Hank selected 14 days on 2026-10-27. Keep original observation timestamps.
UPDATE "RetailPriceObservation"
SET "expiresAt" = "checkedAt" + INTERVAL '14 days'
WHERE "status" IN ('NOT_FOUND', 'NEEDS_SPEC')
  AND "expiresAt" = "checkedAt" + INTERVAL '7 days';

-- Preserve earlier source deadlines, withdrawals and prior review decisions.
UPDATE "ExternalListingCandidate"
SET "expiresAt" = "observedAt" + INTERVAL '14 days'
WHERE "expiresAt" > "observedAt" + INTERVAL '14 days';
