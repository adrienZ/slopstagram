# Sticker refactoring post-mortem

Date: 2026-10-22. Specification: [#12](https://github.com/adrienZ/slopstagram/issues/12).

The refactor preserved the available story annotations and historical reports.
The execution boundary failed: while only disposable validation was approved, a
running development server appears to have applied the pending migrations to the
live database. Subsequent comparisons found no data loss. This document consolidates
the database improvements plan, migration reviews, and ingestion notes.

## Scope and delivery

Locations and other stickers previously used separate story tables. Extraction
collapsed equal labels, cold reads could omit annotations, and saving partial
responses could erase previously stored data. Reports needed a consistent story
view while retaining their own historical snapshots.

The work was split into separately reviewable steps:

| Step                                                         | Delivery                                                                                                          | Status                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Lossless story reads and resaves                             | [#13](https://github.com/adrienZ/slopstagram/issues/13), [PR #17](https://github.com/adrienZ/slopstagram/pull/17) | Merged                                                |
| Additive schema and one-time location backfill               | [#14](https://github.com/adrienZ/slopstagram/issues/14), [PR #18](https://github.com/adrienZ/slopstagram/pull/18) | Merged                                                |
| Source-aware ingestion, atomic updates and unified consumers | [#15](https://github.com/adrienZ/slopstagram/issues/15), [PR #19](https://github.com/adrienZ/slopstagram/pull/19) | Merged as `8eaabf7`                                   |
| Remove obsolete location storage                             | [#16](https://github.com/adrienZ/slopstagram/issues/16), [PR #20](https://github.com/adrienZ/slopstagram/pull/20) | Prepared against merged #19 on `main`; awaiting merge |

Earlier changes renamed `report_reels` to `report_story_groups` in
[PR #8](https://github.com/adrienZ/slopstagram/pull/8) and made summary ownership
reference `instagram_users.pk` in [PR #9](https://github.com/adrienZ/slopstagram/pull/9).
[PR #10](https://github.com/adrienZ/slopstagram/pull/10), biography enrichment, was
dropped because it required another request per account; see [RATIONALE.md](../../RATIONALE.md).

Before the staged sticker work, recovery reconciled an accidentally applied broader
draft with the merged schema. It restored 7,737 available report annotations and 82
story locations, preserved reports and media/analysis data, and removed the unused
biography column and obsolete draft migration record. The user approved clearing
1,013 backed-up summary cache entries. That recovery could not reconstruct duplicate
occurrences or snapshot membership already lost by the earlier normalization.
The test that migrated the default database was removed; current migration tests
receive explicit in-memory databases.

## Resulting data contract

`story_stickers` stores locations, mentions, music, hashtags and links. Each row
retains kind, label, occurrence order and source. `story_sticker_sources` records
successfully observed sources, including empty contributions. No new JSON storage,
coordinates, destination IDs, video downloads or extra Instagram requests were added.
Report snapshot columns, array membership, ordering and duplicate values stay separate.

A valid supplied source replaces only its own contribution; an empty array clears
it. Omitted or null sources preserve saved data. A malformed source, including one
invalid member in an otherwise valid array, preserves its whole contribution and
emits a warning identifying the story and source without logging the raw payload.
One source can contribute several kinds. Equal labels within or across sources
remain separate occurrences; retrying an observation does not accumulate copies.

Normalized story reads carry occurrences and observed-source state without inventing
raw Instagram geometry or IDs. Resaves retain that state. Fresh reports and cached
items use the effective merged annotations. Reading, merging and replacing
annotations and source presence run in one transaction, so a failed replacement
retains the previous annotation state. Existing media and caption update semantics
were outside this change.

Migrated rows have unknown provenance. A single valid observation must cover every
source capable of contributing a kind before replacing that kind's unknown rows.
Separate partial observations do not collectively establish completeness. Unknown
custom kinds remain readable and resavable.

The fixed source order is `story_bloks_stickers`, `story_music_stickers`,
`story_hashtags`, `story_link_stickers`, `story_cta`, `story_bloks_tappables`,
`text_post_share_to_ig_story_stickers`, `link`, then `story_locations`. Preserve array
order within each source; a bloks entry containing both a mention and a location emits
the mention first. Unknown historical occurrences retain their relative order before
known sources. This does not claim to recover visual placement. Public location and
non-location sticker projections retain their existing shape.

## Migration design and intended deployment

Both migrations and their snapshots were generated with Drizzle Kit. The additive
migration was generated with `npm run db:generate -- --name unify_story_stickers`,
then its explicit backfill was added. Its only historical sources were
`story_stickers` and `story_locations`. Report snapshots, raw cache files, older
backups and network refetches were deliberately excluded as backfill inputs.
They could not reliably establish occurrence identity or source completeness.

The [additive migration](../../sdk/database/migrations/20261022123737_unify_story_stickers/migration.sql)
adds source provenance and the source-presence table, then stages every existing
sticker and location using `UNION ALL`. Old stickers precede old locations, each in
its previous relative order. Dense zero-based positions avoid collisions from sparse
or negative historical positions. Every occurrence survives; unknown provenance and
historical absence are not guessed. The old location table was retained for the
runtime transition. Drizzle wraps the migration and ledger update in a transaction;
an injected insertion failure verified rollback. Repeat migrator runs are a no-op;
manually repeating raw backfill SQL is unsupported.

The [cleanup migration](../../sdk/database/migrations/20261022131359_remove_story_locations/migration.sql),
generated with `npm run db:generate -- --name remove_story_locations`, contains only:

```sql
DROP TABLE `story_locations`;
```

Its snapshot follows the additive migration. There is no second backfill, recurring
repair job or copy-on-read behavior. The Instagram field `story_locations` remains
an ingestion source; application code no longer accesses the obsolete table.

The intended deployment order was: stop development servers and preceding writers;
apply compatibility preparation; apply the additive migration and one-time backfill;
deploy unified ingestion; then apply cleanup. A preceding writer must not resume
after backfill because its new legacy-table writes would not be copied again. It
cannot maintain source provenance and cannot run after the old table is dropped.
Schema PRs must follow the actual preceding migration when rebased. Undoing the
transition requires a consistent earlier backup.

## Unexpected live migration

The user required concrete SQL review before execution and approved validation on
disposable databases only. The confirmed production source was
`/Users/adrienzaganelli/Documents/code/slopstagram/data/slopstagram.sqlite`.
The validation scripts opened sources read-only and targeted guarded, distinct
SQLite backup files containing committed WAL data. They issued no live migration
command.

During cleanup validation, the live journal acquired both pending sticker migrations
and the legacy table disappeared. An existing `npm run start` / Vite process held
the live database open. `server/plugins/database.ts` runs the migrator unconditionally
at Nitro startup. A startup or watcher reload is the likely trigger; the exact
triggering event was not captured.

The agent did not check for that running server before preparing migration files.
Protecting the validation script's database target did not isolate the separate
startup migrator. This allowed live execution outside the approved scope before
validation completed, despite the intended staged deployment.

The response was to inspect the live state read-only and create a consistent
backup of the resulting state. Exact comparisons matched
every live data row to the initial cleanup-validation copy. Unified sticker kinds,
labels, multiplicity, positions and provenance also matched the earlier additive
validation copy; unrelated rows and report history were unchanged. Integrity and
foreign-key checks passed. No automatic rollback or journal rewrite was attempted.
Further live changes still require explicit approval.

## Validation and impact

The additive backfill preserved **2,055 sticker rows + 82 location rows = 2,137
occurrences across 873 affected stories**. An independent sequence comparison
verified labels, kinds, multiplicity and stored order. Historical provenance stayed
unknown and source presence started empty.

Fresh-chain and staged-upgrade fixtures covered locations-only, stickers-only, both,
empty annotations, repeated labels, unusual kinds and sparse historical positions.
Runtime checks covered all five kinds, partial updates, known-empty contributions,
unknown provenance, failed replacements, fresh/cold reports and repeated resaves.
All 1,397 stories were cold-read, projected into manifests and resaved before and
after cleanup on disposable copies. All 66 historical reports remained equal.

One Python assertion initially compared physical SQLite row order after resaves.
The Node validator's logical comparisons passed. Correcting Python to compare full
row multisets, including multiplicity and stored order columns, removed that false
failure. Independent subsequent runs used a fresh current-production backup and a
copy of the retained additive-schema validation backup. Both passed integrity and
foreign-key checks, protected-row comparisons and repeated no-op migration checks,
including schema and journal. The read-only source files stayed unchanged during
those final runs.

| Preserved data                           |               Rows |
| ---------------------------------------- | -----------------: |
| Reports / report stories / report groups | 66 / 6,112 / 2,647 |
| Stories / Instagram users                |        1,397 / 157 |
| Image versions / video versions          |      2,794 / 2,829 |
| OCR / vision results                     |      1,530 / 1,484 |
| Report failures / user summaries         |             44 / 0 |
| Unified sticker occurrences              |              2,137 |

Both final copies produced the protected-data digest
`c25ca737dbf27a31907dda33387bbb7497de6a6d4ee7164e2934a01e485cfd8c`.
The full suite passed 116 tests across 19 suites, without failures or skips, and
typechecking passed. Initial additive fixtures were removed after verification at
the user's request; the ingestion/repository regression tests remain.

Local evidence recorded at validation time:

- Additive copy/results: `/private/tmp/slopstagram-issue-14-h2c81ohi/`.
- Initial transition copy: `/private/tmp/slopstagram-issue-16-afvcvv3g/validation.sqlite`.
- Fresh current-state copy: `/private/tmp/slopstagram-issue-16-zfvt6209/validation.sqlite`.
- Staged cleanup copy: `/private/tmp/slopstagram-issue-16-9fk66j_b/validation.sqlite`.
- Final results: `/private/tmp/slopstagram-issue-16-evidence-bfpz80pk/validation-result.json`.
- Live-state backup/comparison: `/private/tmp/slopstagram-issue-16-live-state-npcnxlq8/`.
- Earlier backups: `data/backups/slopstagram-before-recovery-2026-10-22_11-06-53.sqlite`
  and `data/backups/slopstagram-before-main-migrations-2026-10-22_12-25-16.sqlite`.

## Lessons and follow-ups

Small staged PRs, reviewed SQL, WAL-aware backups, explicit test database instances,
independent data comparisons and transaction failure checks made verification
possible. Source identity and known emptiness proved necessary for correct partial
updates; label equality was insufficient evidence for deduplication.

- [x] Keep entity schemas in `sdk/entities/` and persistence logic in
      `sdk/repositories/`; the rule is recorded in [AGENTS.md](../../AGENTS.md#persistence-layout).
- [x] Keep migration tests on explicitly supplied disposable databases.
- [ ] Guard live startup migrations with an explicit execution boundary; this
      refactor did not implement that guard. Check and stop development servers before
      preparing future migration files, as well as before applying them.
- [ ] Merge PR #20 after review and resolve parent #12 when all children are complete.
- [ ] Add summary ownership regression coverage for renamed accounts and reused
      usernames; decide whether historical summaries require explicit regeneration.
- [ ] Document temporary remote media URL semantics while retaining cached image
      previews and the decision not to download videos.
- [ ] Review the pre-existing checksum difference for
      `20260814142011_abnormal_sway` without rewriting history to silence it.
- [ ] Address duplicated accessibility-caption storage separately in
      [#11](https://github.com/adrienZ/slopstagram/issues/11), using the story value as
      the source of truth after reviewing legacy data and consumers.
