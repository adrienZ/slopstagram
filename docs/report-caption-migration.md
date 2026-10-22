# Report caption migration (#11)

Reports now resolve `ig_caption` from the associated story's
`accessibilityCaption`. Null, empty, whitespace-only, and missing story captions
produce the existing `N/A` placeholder. Report saves never populate or overwrite
story captions. Report locations, stickers, statuses, and other snapshot fields
retain their existing behavior.

The schema change was generated with:

```sh
npm run db:generate -- --name=use_story_accessibility_caption
```

A data-loss preflight precedes Drizzle Kit's generated `DROP COLUMN`. It aborts
the migration if any non-empty legacy caption other than the `N/A` placeholder
has no non-empty canonical story caption. Whitespace detection matches JavaScript
`trim()`. This also protects older databases that migrate through all historical
schemas in one run. No caption backfill is included in the migration.

## Database copy audit, 22 October 2026

A consistent copy of `data/slopstagram.sqlite` was created with SQLite's online
backup API at `/private/tmp/slopstagram-issue-11-Ckkphw/validation.sqlite`.

| Observation                                         | Count |
| --------------------------------------------------- | ----: |
| Report story rows                                   | 6,172 |
| Rows with a non-empty canonical caption             | 1,874 |
| Rows without a non-empty canonical caption          | 4,298 |
| Conflicting non-empty canonical and legacy captions |     0 |
| Report-only non-empty caption rows, excluding `N/A` |     2 |
| Distinct stories needing a recovery decision        |     1 |

Story `4005186195896572042` exists with a null `accessibilityCaption`. Two reports
hold the same non-empty caption for it; there is one distinct recovery value.
The actual caption text is not reproduced here.

Running the migration against this copy correctly aborted at the
`review_report_only_captions` constraint. The migration ledger, all 6,172 report
rows, both recovery candidates, and the story's null caption remained unchanged.
Tests against historical schemas separately verify successful column removal,
canonical-caption precedence, snapshot preservation, and repeated migration runs.

## Proposed recovery — not applied

Approval is pending. Recover the one unambiguous report-only caption into its
existing story, first on the validation copy. This proposal changes one story
caption, leaves both report rows unchanged, and never overwrites a non-null
canonical caption. Re-audit a fresh consistent copy before any live rollout;
these counts describe the copy above, not future database contents.

```sql
BEGIN IMMEDIATE;

UPDATE stories
SET accessibilityCaption = (
  SELECT min(r.igCaption)
  FROM report_stories r
  WHERE r.mediaPk = stories.mediaPk
    AND trim(r.igCaption) NOT IN ('', 'N/A')
)
WHERE mediaPk = '4005186195896572042'
  AND accessibilityCaption IS NULL
  AND (
    SELECT count(DISTINCT r.igCaption)
    FROM report_stories r
    WHERE r.mediaPk = stories.mediaPk
      AND trim(r.igCaption) NOT IN ('', 'N/A')
  ) = 1;

-- Require changes() = 1 and verify the recovered value before committing.
SELECT changes();

COMMIT;
```

If the expected single-row update does not hold, roll back and review the new
state. After approved recovery, rerun the migration on the copy and compare report
rows excluding the removed column, all other tables, integrity, and foreign keys.
Only then apply the approved procedure to the live database.

Server startup and report creation run migrations automatically. They will stop
at this preflight while report-only captions remain unresolved. Do not deploy or
start the updated app against the live database before completing that review.
