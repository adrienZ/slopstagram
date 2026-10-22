# Database improvements plan

Updated: 2026-10-22. Base: `origin/main` at `435eeb8`.

## Decisions

- [PR #8](https://github.com/adrienZ/slopstagram/pull/8) merged:
  `report_reels` is now `report_story_groups`.
- [PR #9](https://github.com/adrienZ/slopstagram/pull/9) merged:
  summaries reference `instagram_users.pk`. Only unresolved historical rows retain
  `legacyUsername`.
- [PR #10](https://github.com/adrienZ/slopstagram/pull/10) dropped:
  do not add per-account profile requests for biographies. See [the rationale](../RATIONALE.md).
- Keep report-level location/sticker snapshots separate from canonical story data.
  Preserve the existing report snapshot columns and behavior.
- Keep source media URLs and cached local previews. Do not download videos.

## Completed locally

- [x] Start from the merged remote main without incorporating the broader database draft.
- [x] Create and integrity-check a consistent backup including WAL contents:
      `data/backups/slopstagram-before-main-migrations-2026-10-22_12-25-16.sqlite`.
- [x] Validate recovery and the merged Drizzle migrations on a disposable database copy.
- [x] Reconcile the accidentally applied draft before applying the merged migrations.
      Restore report annotation arrays and the separate `story_locations` table; remove
      the unused, entirely NULL biography column and obsolete draft migration record.
- [x] Clear 1,013 backed-up summary cache entries so historical username matches are
      not carried into the new ownership model. New report generation will save fresh
      summaries with PK references. Historical report summaries remain unavailable
      until their corresponding inputs are processed again.
- [x] Apply the rename and summary-reference migrations using the application's
      Drizzle migrator. Preserve all 66 reports, 6,112 report-story rows, and 2,647 report
      groups. Restore 7,737 available report annotations and 82 canonical locations.
      Leave OCR, vision analysis, stories, and image/video-version records intact.
- [x] Verify SQLite integrity and foreign keys; confirm repeat migration is a no-op.
- [x] Isolate the default database connection in Node test workers and add a
      regression check so tests cannot migrate the working database accidentally.
- [x] Run the full `npm run check`: 111 tests passed, none skipped. Compare the
      recovered schema with a freshly migrated main database and verify preserved data
      against the backup.

The earlier draft deduplicated labels and merged location membership. Recovery
preserves the available labels and ordering within each kind; exact original
duplicates or membership in both snapshot arrays require an older backup. The
pre-recovery backup retains the normalized source data and old summaries.

## Remaining work, as separate small changes

1. **Summary identity and historical cache reads.** Add regression coverage for a
   user renaming their account and a different account reusing that username.
   Preserve the report's historical display name while validating cached results
   against a stable owner. Do not rebuild old summary ownership solely from current
   usernames. Decide whether any historical summaries need explicit regeneration.
2. **Canonical sticker model.** Merge `story_locations` into `story_stickers` with
   `kind = 'location'`. Support mentions, music, hashtags, links, and locations through
   the same persistence path. Keep report snapshots as agreed above. Do not introduce
   new JSON storage columns.
3. **Cached annotation reads.** Ensure `StoryRepository.findByMediaPk()` retains the
   annotation information needed to reconstruct manifests. Test fresh ingestion,
   cold reads, resaves, ordering, and duplicate location labels across every supported
   kind. Include a transaction around replacement writes so failures retain old data.
4. **Sticker migration/backfill review.** Generate the schema change with Drizzle Kit,
   then add a data-preserving backfill for existing locations and recoverable report
   annotations. Review it before applying it, validate against a backup copy, compare
   counts and ordering, and check foreign keys. Keep this migration in its own PR.
5. **Media URL semantics.** Document remote image/video versions as temporary source
   metadata. Continue serving cached image previews for historical reports; do not
   treat expired remote URLs as durable media or add video downloads.
6. **Older migration checksum.** Review the pre-existing checksum difference for
   `20260814142011_abnormal_sway`. Its recorded hash was already present in the
   pre-recovery backup. Both newly applied migration hashes match their files;
   do not rewrite the old journal entry merely to silence the difference.

For each change, run `npm run check` with the isolated test database. Merge schema
PRs sequentially and regenerate their Drizzle snapshots after rebasing, so the
migration history remains linear. Do not cherry-pick the broader draft wholesale.
