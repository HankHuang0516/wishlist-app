# Same-database source records

The existing ExternalSourceLead row is the authority for private drafts, publication and Explore. Library exports remain historical backups. This is a source reference, never proof of stock, display rights or qualified supply.

Existing marketplace-admin authentication protects /api/source-lead-admin/records. No new credential is needed. Responses use the existing no-store and rate-limit middleware. Never place credentials in URLs or exports.

1. GET records?archiveItemId=<stable ID> reads current UUID, revision and stateHash. Follow nextCursor to enumerate all records.
2. POST records/save uses a fresh operationId, at most 20 exact items, expectedRevision and expectedStateHash, and facts. New records require revision 0 and hash null. A sourceCheckRef binds genuine source evidence to its source URL and actual checkedAt; it must not be reused for a later check. Incomplete drafts are private. Sold/withdrawn claims need stateEvidenceRef and cannot be republished.
3. Read the saved row. POST records/publish requires the exact UUID/revision/stateHash/pendingHash, a reviewRef and confirmSourceReference=true. Publication enforces the existing location/date/privacy/evidence/freshness gates. It updates the same UUID, preserves historical Library lineage and creates a history event in the same transaction.
4. Read records/:id/history with pagination, the public /api/source-leads/:id and full paginated Explore query. Stock remains UNKNOWN, qualifiedSupply false, checkout disabled. A source reference does not count toward the 10,000 verified goods goal.
5. GET records/:id/export?format=json|csv creates an on-demand backup. CSV cells are formula-safe. Private drafts and history are not public DTO fields.

Operations are idempotent by operation UUID plus body hash; a retry returns the original receipt. A changed body with the same operation UUID fails. Revision/state CAS and transaction locking prevent stale overwrites. Legacy archive import rejects native-master or pending rows.

## Release and rollback

Migration 20261012070000_db_source_records changes structure only: private status, nullable draft-only fields, origin/revision/draft fields, public-shape constraints and a history table. It performs no archive ingestion, backfill, deletion or inventory write. Existing public rows retain their required public shape. Validate in an isolated database before production deployment.

Initial production data scope is only the three approved bank source references, no photos, rights/stock unverified. Get current hashes after migration; do not replay an old archive-import payload. Do not transmit the full archive.

Before data writes, retain deployment revision and existing row snapshots in the controlled history. After native drafts exist, rollback must retain nullable fields, private status and history; do not drop the table or restore NOT NULL blindly. Stop writes and public source publication, then deploy a compatible forward fix. Historical CSV/JSON remain preserved. This change does not enable external inventory publication or alter freshness windows.
