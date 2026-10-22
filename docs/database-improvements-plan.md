# Database improvements plan

Updated: 2026-10-22. Base: `origin/main` at `738e644`.

## Decisions

- [PR #8](https://github.com/adrienZ/slopstagram/pull/8) merged:
  `report_reels` is now `report_story_groups`.
- [PR #9](https://github.com/adrienZ/slopstagram/pull/9) merged:
  summaries reference `instagram_users.pk`. Only unresolved historical rows retain
  `legacyUsername`.
- [PR #10](https://github.com/adrienZ/slopstagram/pull/10) dropped:
  do not add per-account profile requests for biographies. See [the rationale](../RATIONALE.md).
- Keep report-level location/sticker snapshots separate from story data.
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
      groups. Restore 7,737 available report annotations and 82 story locations.
      Leave OCR, vision analysis, stories, and image/video-version records intact.
- [x] Verify SQLite integrity and foreign keys; confirm repeat migration is a no-op.
- [x] Remove the report view-model test that migrated the default database.
      Remaining migration tests explicitly use in-memory databases; the runtime
      test-environment switch and its regression test were removed.
- [x] Run the full `npm run check`: all tests passed, none skipped. Compare the
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
2. **Story sticker model.** Merge `story_locations` into `story_stickers` with
   `kind = 'location'`. Support mentions, music, hashtags, links, and locations through
   the same persistence path. Keep report snapshots as agreed above. Do not introduce
   new JSON storage columns.
3. **Cached annotation reads.** Ensure `StoryRepository.findByMediaPk()` retains the
   annotation information needed to reconstruct manifests. Test fresh ingestion,
   cold reads, resaves, ordering, and duplicate location labels across every supported
   kind. Include a transaction around replacement writes so failures retain old data.
4. **Sticker migration/backfill review.** Generate the schema change with Drizzle Kit,
   then add a data-preserving backfill sourced only from `story_locations` and
   `story_stickers`. Do not reconstruct annotations from report snapshots, raw cache,
   or older backups. Run the backfill once as part of the migration, rather than
   during normal reads or writes. Review it before applying it; validate against a
   fresh, consistent copy of the production database, compare counts and ordering,
   and check foreign keys. Keep this migration in its own PR.
5. **Media URL semantics.** Document remote image/video versions as temporary source
   metadata. Continue serving cached image previews for historical reports; do not
   treat expired remote URLs as durable media or add video downloads.
6. **Older migration checksum.** Review the pre-existing checksum difference for
   `20260814142011_abnormal_sway`. Its recorded hash was already present in the
   pre-recovery backup. Both newly applied migration hashes match their files;
   do not rewrite the old journal entry merely to silence the difference.
7. **Story accessibility caption.** Track separately in
   [issue #11](https://github.com/adrienZ/slopstagram/issues/11):
   `report_stories.igCaption` and `stories.accessibilityCaption` represent the same
   data; make the story value the source of truth and remove redundant storage
   after reviewing legacy data and migrating consumers.

## Sticker refactoring workflow

Scope this work to items 2–4 above. Summary identity, media URL documentation,
and the older migration checksum are separate follow-ups.

1. Use `/grill-with-docs` to agree on the story sticker model, ingestion and
   cached-read behavior, ordering, duplicate handling, and reliable historical
   backfill sources. Preserve existing report snapshots. Record resolved terms in
   `GLOSSARY.md` and significant trade-offs in `docs/adr/` where appropriate.
2. Use `/to-spec` to capture the agreed behavior, schema, migration rules, and
   verification in the configured GitHub issue tracker. Published as
   [specification #12](https://github.com/adrienZ/slopstagram/issues/12), labelled
   `ready-for-agent`.
3. Use `/to-tickets` to agree on small, independently verifiable changes and their
   dependencies, then publish the approved breakdown. Published as sub-issues
   #13–#16 of specification #12, all labelled `ready-for-agent`.
4. Use `/implement` per ticket. Generate schema migrations with Drizzle Kit and
   verify ingestion, persistence, and cached reads using explicit in-memory test
   databases.
5. Discuss the migration and backfill before applying either. Review the concrete
   SQL and expected data changes, validate against a consistent backup copy, and
   apply to the working database only after explicit approval.

The sticker design decisions are recorded below. #13 was implemented and merged in
[PR #17](https://github.com/adrienZ/slopstagram/pull/17). #14's additive schema and
backfill merged in [PR #18](https://github.com/adrienZ/slopstagram/pull/18) after
[disposable validation and SQL review](sticker-migration-review.md).
#15 now implements [unified ingestion, source updates, and reads](story-sticker-ingestion.md).
Production migration and backfill execution still require separate explicit approval.

### Approved and published ticket breakdown

| Ticket                                                                                         | Blocked by | Deliverable                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#13: Lossless annotation reads and resaves](https://github.com/adrienZ/slopstagram/issues/13) | None       | Normalize existing annotations for cold reads, manifests, timelines, and resaves; prepare compatibility with location-kind sticker rows.                  |
| [#14: Additive schema and one-time backfill](https://github.com/adrienZ/slopstagram/issues/14) | #13        | Drizzle Kit migration PR introducing the unified model and source provenance; transfer story locations once while retaining the legacy table temporarily. |
| [#15: Unified ingestion and consumers](https://github.com/adrienZ/slopstagram/issues/15)       | #14        | Preserve occurrences, apply atomic source-level updates, handle legacy provenance, and move all readers/writers to the unified model.                     |
| [#16: Remove obsolete location storage](https://github.com/adrienZ/slopstagram/issues/16)      | #15        | Separate Drizzle Kit cleanup migration PR after no caller needs the old table; validate the complete transition.                                          |

The backfill runs only in #14. #16 removes obsolete storage without another backfill.
Each migration is reviewed before execution and validated on a consistent production
copy. Application states remain compatible through the staged transition. All four
tickets are native sub-issues of #12, with native blocking links forming
#13 → #14 → #15 → #16. #13 and #14 are merged; #15 is implemented on `codex/story-sticker-ingestion`. The parent specification's
body, labels, and state are unchanged.

### Agreed sticker behavior

- Preserve separate sticker occurrences, including identical kind/label pairs,
  and their order within an observation. Saving the same observation again must
  not accumulate additional copies.
- Keep entries from different Instagram source fields when they share a label;
  do not infer that equal labels identify one sticker. This may retain multiple
  representations when the source provides no reliable occurrence identity.
- Story annotations represent the latest complete observation, rather than
  an accumulation across observations. Each supplied annotation field replaces
  its own stored contribution; an explicitly empty array clears that contribution.
  Omitted fields preserve existing data. Apply all replacements atomically in one
  transaction. Explicit null or malformed annotation input preserves existing
  annotations; report malformed input rather than interpreting it as an empty list.
- Persistence must retain enough internal source provenance to apply partial
  replacements without erasing entries contributed by other fields of the same
  kind. This bookkeeping is separate from the richer sticker metadata excluded
  below; specify handling of migrated rows without source provenance before build.
- Existing report snapshots retain their historical values.
- Preserve order within each source array and use a fixed, documented order
  between sources. Visual ordering across kinds is not a requirement.
- Keep this refactor focused on kind, label, and occurrence order. Richer metadata
  such as coordinates or destination IDs is outside this change.
- Run historical backfill once during migration. Test the migration on a fresh,
  consistent copy of the production database before applying it to production;
  the original database must not be the test target. For a live SQLite database,
  use a consistent backup that includes WAL contents rather than copying only
  the main file.
- Use only `story_locations` and `story_stickers` as backfill sources. Preserve
  their existing rows and ordering within each source; do not try to reconstruct
  previously lost occurrences from report snapshots, raw cache, or older backups.

### Findings and design status

- #13 closed the cached annotation read/resave round trip. Source-level partial
  replacements and transactional application writes are implemented in #15.
- The preceding extraction grouped stickers by kind and deduplicated labels. The source
  does not establish a global visual order across kinds. The agreed deterministic
  source ordering must not claim to recover unavailable visual ordering.
- Report snapshots identify the story but retain formatted labels, not original
  sticker IDs, coordinates, or observation timestamps. They cannot reconstruct
  all original metadata.
- Raw story cache files may offer richer backfill data if present and validated
  against the exact story ID. Their completeness and freshness are not established
  by the current storage code; do not assume they supersede story data.
- Candidate historical sources are the story annotation tables, report
  snapshots, raw per-story cache files, and earlier database/cache backups. Only
  the first two are available from a production database copy alone. Cache files
  and older backups would need to be supplied separately and reviewed; availability
  has not been checked.
- The selected backfill sources are the two story annotation tables only;
  the other sources above are excluded from this migration.
- A real anonymized fixture contains separate mention occurrences with the same
  username but different occurrence IDs and positions. A synthetic extraction test
  also represents one location through both direct and bloks fields. Equal labels
  therefore cannot establish whether entries are distinct occurrences or alternate
  representations. A duplicate link across fields is possible from the extraction
  paths, but has not been established by a real fixture.
- Q1–Q9 are resolved, specification #12 is published, and the approved ticket
  breakdown is published as #13–#16. #13 and #14 are merged; #15 is implemented on `codex/story-sticker-ingestion`.
  Migration and backfill execution still require discussion of the concrete
  migration before application.
- The test boundary was confirmed: public ingestion through a real repository on
  an explicit in-memory database, cold read without raw cache, report construction,
  and lossless resave. Add targeted repository replacement/rollback checks and
  migration validation on a production copy; avoid tests of every internal helper.

For each change, run `npm run check`; migration tests must use an explicit in-memory
database. Merge schema PRs sequentially and regenerate their Drizzle snapshots after
rebasing, so the migration history remains linear. Do not cherry-pick the broader
draft wholesale.
