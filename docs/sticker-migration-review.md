# Sticker migration review — issue #14

Status: reviewed and validated on disposable databases on 2026-10-22.
**The production database has not been migrated.**
Base: merged PR #17, `origin/main` at `6312c44`.

This is the additive step in [issue #14](https://github.com/adrienZ/slopstagram/issues/14).
It prepares storage for #15; #16 will remove the legacy location table later.

## Schema and historical data

Drizzle Kit generated
[`20261022123737_unify_story_stickers`](../sdk/database/migrations/20261022123737_unify_story_stickers/migration.sql)
and its snapshot with `npm run db:generate -- --name unify_story_stickers`.
The historical data statements were then added to that generated migration.

- `story_stickers.source TEXT NOT NULL DEFAULT 'unknown'` retains compatibility
  with the preceding writer, which inserts only kind, label, mediaPk and sortOrder.
  A future writer can use the actual Instagram field name as provenance.
- `story_sticker_sources(mediaPk, source)` records a successfully observed field,
  including an explicitly empty array. Its composite primary key prevents duplicate
  presence rows; its story foreign key cascades on delete. Occurrences remain in
  `story_stickers`; ordering them by sortOrder preserves their order within a source.
- There is no restricted kind enum: location, mention, music, hashtag and link work,
  and unusual historical kinds survive. No new JSON or richer metadata is stored.
- Historical absence does not establish a known empty response. The new presence
  table starts empty; every historical occurrence has source `unknown`.

The one-time backfill reads **only** `story_stickers` and `story_locations`:

1. Stage every existing sticker and every legacy location in a temporary table,
   converting only the latter to kind `location`.
2. Assign dense, zero-based sortOrder values per story: old stickers in their
   existing sortOrder, then old locations in their existing sortOrder. This avoids
   collisions with negative or sparse historical positions. Existing positions
   are renumbered; relative order within each old table is preserved.
3. Replace the sticker rows from this staging table and drop the temporary table.

The SQL uses `UNION ALL`; equal labels survive, including a location already
represented in both tables. We cannot prove those rows describe one occurrence,
so none are deduplicated. Previously lost duplicates or source identities cannot
be reconstructed. Expected sticker row count after migration is the sum of the
previous sticker and location row counts.

The generated SQL and complete backfill are the reviewable source linked above.
Drizzle's installed Node SQLite migrator wraps the schema change, staging,
replacement and migration ledger entry in one transaction. A failure must roll
back the migration. No foreign-key disabling is added here. A second **migrator**
run skips the recorded migration; manually repeating the raw SQL is unsupported.

## Application compatibility

`story_locations` is retained unchanged. PR #17's repository already reads
location-kind sticker rows, separating them from public non-location stickers.
Cold reads, timelines and cold resaves can consume the unified historical rows.
When both historical tables contain location rows, all become visible as location
occurrences; preserving both sources takes precedence over guessing equality.

The preceding writer may still replace both tables and put newly fetched locations
only in the legacy table. Existing fallback reads support that transitional state.
This migration does not introduce dual-write triggers or change extraction,
partial updates, transactions in the application, or source replacement logic.
Those changes belong to #15. Do not mix preceding writers with #15's source-aware
writer once source-presence tracking becomes active.

Report snapshots and all other tables are outside the backfill. Report-level
annotations are never read as recovery sources or rewritten. No media is fetched.

## Execution approval and validation

The user requested discussion of concrete migration/backfill SQL before execution.
After reviewing this proposal, the user approved validation on disposable databases
only and confirmed the production source below. Applying the migration to production
still needs a separate explicit decision. Do not start the app or report scripts
against production before that decision: they apply pending migrations automatically.

The local application default resolves to
`/Users/adrienzaganelli/Documents/code/slopstagram/data/slopstagram.sqlite`.
The user confirmed this file is the production source. A read-only SQLite connection
and SQLite backup API produced the fresh target
`/private/tmp/slopstagram-issue-14-h2c81ohi/validation.sqlite`, including committed WAL
contents. The target is a new file with a distinct identity, in a private temporary
directory; no existing backup or database was overwritten.

Validation covers:

1. Run the migration fixture using direct `DatabaseSync(':memory:')` and Drizzle,
   without importing the default database client. It migrates to the preceding
   schema first, seeds historical data, then applies the new migration. Check
   locations-only, stickers-only, both (including a kind-location collision),
   duplicates, empty annotations, unusual kinds and noncontiguous ordering.
2. Verify current repository cold reads, timeline reads and resaves, unknown-source
   defaults, representable known-empty sources, uniqueness and foreign keys.
   Compare unrelated tables and report snapshots exactly; confirm integrity and
   a second migrator run changes neither rows nor migration ledger.
3. Run a failure-injection check demonstrating migration rollback, and run
   the complete `npm run check` after fixture validation.
4. Open the confirmed production source read-only and use SQLite's backup API to
   obtain a fresh consistent target containing committed WAL contents. Do not copy
   just the main SQLite file. Record the source path, target path, pre-migration
   ledger and integrity checks; abort on unexpected pending migrations or corruption.
5. Snapshot all non-sticker table rows (including legacy locations and report
   snapshots) on the target. Independently derive expected ordered occurrences
   from the two old annotation tables. Apply the migration to the target only.
   Compare exact occurrences, multiplicities and source-relative order, unchanged
   protected data, integrity, foreign keys and second-run no-op behavior. Compare
   the source schema/ledger again to confirm this work did not migrate it.

Keep the working/production database untouched. Applying to it needs a separate
explicit decision after the disposable validation results are available.
Regenerate the Drizzle snapshot if preceding migration history changes before merge.

### Recorded results

- The schema-only regression failed with missing legacy location occurrences;
  the complete backfill passed. Both migration fixtures pass, including an injected
  insertion failure restoring the original schema, rows, temporary schema and ledger.
- The production source was at `20261022091929_user_summary_instagram_pk`.
  Only `20261022123737_unify_story_stickers` was applied to the disposable copy.
- **2,055 sticker rows + 82 location rows became 2,137 sticker occurrences across
  873 stories.** An independent comparison from the two old table sequences matched
  every kind, label, occurrence and position. All provenance is unknown; presence
  starts empty.
- Exact comparisons preserved all other tables, including 66 reports, 6,112 report
  stories, 2,647 report groups, 1,397 stories, 2,794 image versions, 2,829 video
  versions, 1,530 OCR entries and 1,484 vision entries. Legacy locations remain intact.
- Integrity and foreign-key checks passed. A second migrator run changed neither
  rows nor ledger. The production source schema and ledger remained unchanged.
- Local result details are retained in
  `/private/tmp/slopstagram-issue-14-h2c81ohi/validation-result.json`.
- `npm run check` passed: 114 tests, 19 suites, zero failures or skips. Typechecking
  also passed. Final Standards and Spec reviews found no actionable issues.
