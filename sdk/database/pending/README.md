# Pending database review

Nothing in this directory is loaded by the application migrator. Do not move or
execute these files until the backfill discussion is complete. The implementation
expects the agreed schema, so report generation should wait for that review.

## Agreed schema

- Rename `report_reels` to `report_story_groups`, preserving its rows and ordering.
- Add nullable `instagram_users.biography`; missing biographies populate during a
  future authenticated fetch, not from fabricated migration data.
- Store canonical locations in `story_stickers` with `kind = 'location'` alongside
  mentions, music, hashtags, and links. Retain annotations on database reads.
- Reference `instagram_users.pk` from summaries. Match only unambiguous usernames;
  retain unmatched or ambiguous historical usernames in `legacyUsername`.
- Preserve `report_stories.locations` and `report_stories.stickers` as they were.
- Preserve source media URLs and current preview caching. Do not download videos.

## Earlier draft applied by an existing test

The earlier `npm run check` invoked `tests/report-view-model.test.ts`, which called
`migrateDatabase()` with the application's default connection. That applied the
earlier draft to the working database. The default connection now uses an in-memory
database in Node test workers, and the test checks that isolation explicitly.

The exact earlier migration and snapshot are retained in `applied-history/` for
reconciliation. Do not edit or reapply them. The earlier migration normalized report
annotations, removed the two report annotation columns, merged canonical locations,
and linked summary owners.

A consistent SQLite backup including WAL contents was created at:

`data/backups/slopstagram-before-recovery-2026-10-22_11-06-53.sqlite`

Its integrity check passed. It contains 66 reports, 6,112 report-story rows, 7,737
normalized report annotations, 2,137 canonical stickers, and 1,013 summaries. This
is a backup of the state after the earlier migration, before recovery.

## Two distinct draft paths

`20261022090654_improve_story_groups_and_user_profiles/` is the migration draft for
databases that have not received the earlier draft. It copies canonical locations
and available report annotations before dropping `story_locations`, preserves the
report arrays, and backfills user references without deleting unmatched summaries.
Its regression test is written but has not been run following the request to discuss
backfills first.

`recover-local-report-snapshots.sql` is a separate proposal for the affected working
database. It restores report arrays from the normalized table, renames the report
groups table, and preserves the normalized table as an additional recovery source.
It leaves the biographies, summary references, and unified canonical stickers in
place. Do not also run the migration intended for an unmigrated database against it.

The earlier draft deduplicated labels and merged location membership. Reconstruction
can retain the available labels and their ordering within each kind; it cannot prove
the original duplicate occurrences or whether a location also appeared in the old
`stickers` array. An older external backup would be needed for exact restoration of
those details.

Before applying anything: review this distinction, validate the recovery on a copy,
and agree how to reconcile the working database's migration journal with the final
schema. No recovery or journal changes have been executed.
