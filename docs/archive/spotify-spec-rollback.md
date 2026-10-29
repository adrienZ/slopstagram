# Rollback guide: restore the Spotify music specification

Prepared on 2026-10-26 for `adrienZ/slopstagram`.

## Restore point

These are the exact issue titles and bodies saved immediately before the owner
replaced Spotify matching with Instagram audio/artwork playback on 2026-10-26.
They already include #40 as completed by PR #47. Restoring them brings back:

- #35: the parent specification with queued Spotify matching as its final milestone.
- #41: one Spotify matching job and reliable track buttons.
- #42: automatic Spotify matching scheduling and recovery with bunqueue.

The complete original bodies are embedded below. This guide does not depend on
this chat or the temporary files used when editing the issues.

This restores the **specification**, not application code, migrations, local media,
or database contents. The completed metadata, cache enrichment, and location map
milestones #36–#40 remain completed in the saved parent spec. Existing issue numbers,
labels, states, comments, and dependency relationships are not changed by the commands.
All three issues were open when these snapshots were captured.

The integration branch remains `codex/sticker-metadata`; this is not a request to
merge into `main`.

## Before applying

1. Decide to resume the previous Spotify scope. Preparing this document has not
   rolled back the active Instagram-media plan on GitHub.
2. Review any work delivered after this restore point. If #41 or #42 has since
   been implemented or closed, reconcile that work and its ticket state separately;
   do not treat issue-body restoration as a code or data rollback.
3. Check the domain documentation for later changes. At this restore point,
   `docs/adr/0003-resolve-spotify-matches-with-bunqueue.md` still described the
   original Spotify plan; the Instagram-media issue updates did not edit local
   domain docs. If those docs were subsequently revised, align them with the
   restored scope. Inspect the previous versions with:

   ```sh
   git show 51a198c8c5370ca278886c1f796ba7fd2f612f47:GLOSSARY.md
   git show 51a198c8c5370ca278886c1f796ba7fd2f612f47:docs/adr/0001-share-sticker-metadata.md
   git show 51a198c8c5370ca278886c1f796ba7fd2f612f47:docs/adr/0003-resolve-spotify-matches-with-bunqueue.md
   ```

4. The embedded specs preserve the original provider assumptions verbatim. Recheck
   current Spotify authentication and API requirements before implementing them.

## Prepare files and back up the current GitHub versions

Run from the repository root with Python 3 and authenticated `gh` available. This
step reads GitHub and writes temporary files; it does not edit any issue. Keep
`rollback_dir` available in the same shell for the following commands.

```sh
rollback_dir="$(mktemp -d "${TMPDIR:-/tmp}/slopstagram-spotify-spec.XXXXXX")"
python3 - "$rollback_dir" <<'PYTHON'
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

repository = "adrienZ/slopstagram"
folder = Path(sys.argv[1])
document = Path("docs/archive/spotify-spec-rollback.md").read_text()

for number in (35, 41, 42):
    heading = re.search(rf"^## Issue #{number} — (.+)$", document, re.MULTILINE)
    if heading is None:
        raise SystemExit(f"Missing saved title for #{number}")
    start = f"<!-- BEGIN ORIGINAL ISSUE {number} -->"
    end = f"<!-- END ORIGINAL ISSUE {number} -->"
    if document.count(start) != 1 or document.count(end) != 1:
        raise SystemExit(f"Missing or duplicate saved body for #{number}")
    metadata = re.search(
        rf"^<!-- ORIGINAL ISSUE {number} FORMAT trailing-newlines=(\d+) sha256=([0-9a-f]{{64}}) -->$",
        document, re.MULTILINE,
    )
    block = document.split(start, 1)[1].split(end, 1)[0]
    fenced = re.fullmatch(r"\s*(`{3,})markdown\n(.*?)\n\1\s*", block, re.DOTALL)
    if metadata is None or fenced is None:
        raise SystemExit(f"Missing snapshot formatting metadata for #{number}")
    body = fenced.group(2).rstrip("\n") + "\n" * int(metadata.group(1))
    if hashlib.sha256(body.encode()).hexdigest() != metadata.group(2):
        raise SystemExit(f"Snapshot checksum mismatch for #{number}")
    (folder / f"issue-{number}.title").write_text(heading.group(1))
    (folder / f"issue-{number}.md").write_text(body)

    result = subprocess.run(
        ["gh", "issue", "view", str(number), "--repo", repository,
         "--json", "number,title,body,state,labels,updatedAt"],
        check=True, capture_output=True, text=True,
    )
    (folder / f"current-{number}.json").write_text(result.stdout)
    current = json.loads(result.stdout)
    (folder / f"current-{number}.md").write_text(current["body"])
    print(f"#{number}: current title: {current['title']}")
    print(f"#{number}: restore title: {heading.group(1)}")

print(f"Prepared snapshots and current backups in {folder}")
PYTHON
```

Review the differences for each body. `git diff --no-index` exits with status 1
when it finds differences; that is expected here.

```sh
git diff --no-index "$rollback_dir/current-35.md" "$rollback_dir/issue-35.md"
git diff --no-index "$rollback_dir/current-41.md" "$rollback_dir/issue-41.md"
git diff --no-index "$rollback_dir/current-42.md" "$rollback_dir/issue-42.md"
```

The `current-*.json` files preserve the versions replaced by this rollback. Keep
them if you may want to restore the Instagram-media plan again.

## Apply the specification rollback

Run this only when choosing to restore the saved Spotify scope. It restores the
child titles/bodies first, then the parent. A failed GitHub operation stops the
script; inspect the issues before resuming after a partial failure.

```sh
python3 - "$rollback_dir" <<'PYTHON'
import subprocess
import sys
from pathlib import Path

folder = Path(sys.argv[1])
for number in (41, 42, 35):
    subprocess.run(
        ["gh", "issue", "edit", str(number), "--repo", "adrienZ/slopstagram",
         "--title", (folder / f"issue-{number}.title").read_text(),
         "--body-file", str(folder / f"issue-{number}.md")],
        check=True,
    )
PYTHON
```

## Verify

This compares every restored title and body with the extracted snapshots. It also
reports current issue states without reopening or closing tickets automatically.

```sh
python3 - "$rollback_dir" <<'PYTHON'
import json
import subprocess
import sys
from pathlib import Path

folder = Path(sys.argv[1])
for number in (35, 41, 42):
    result = subprocess.run(
        ["gh", "issue", "view", str(number), "--repo", "adrienZ/slopstagram",
         "--json", "title,body,state"],
        check=True, capture_output=True, text=True,
    )
    restored = json.loads(result.stdout)
    if restored["title"] != (folder / f"issue-{number}.title").read_text():
        raise SystemExit(f"Title mismatch for #{number}")
    if restored["body"] != (folder / f"issue-{number}.md").read_text():
        raise SystemExit(f"Body mismatch for #{number}")
    print(f"Verified #{number}: original title/body restored; state={restored['state']}")
PYTHON
```

Confirm #35 still marks #36–#40 complete and identifies #41, followed by #42, as
the remaining Spotify work. Reconcile any later domain-doc changes and delivered
implementation separately before starting that work.

## Original snapshots

These blocks are archival payloads. Preserve their contents and boundary markers
when editing the surrounding guide.

## Issue #35 — Spec: structured sticker metadata, account location map, and queued Spotify matching

<!-- ORIGINAL ISSUE 35 FORMAT trailing-newlines=3 sha256=501a61b79a6935520ad49c910f12bbfdaf7096e1664e6a2636ca77dcf22df359 -->

<!-- BEGIN ORIGINAL ISSUE 35 -->

```markdown
## Delivery progress

Integration branch: `codex/sticker-metadata`. Implementation tickets #36–#38 and #40 are merged there; #39 was completed as a one-time local database operation without merging its temporary tool. The final feature merge into `main` remains pending.

- [x] #36 — Stable sticker occurrence identity ([PR #43](https://github.com/adrienZ/slopstagram/pull/43)).
- [x] #37 — Usable and partial location metadata ([PR #44](https://github.com/adrienZ/slopstagram/pull/44)).
- [x] #38 — Usable and partial music metadata ([PR #45](https://github.com/adrienZ/slopstagram/pull/45)). Includes shared Drizzle-derived report/sticker validation and provider identifier validation. Final validation: 220 tests across 44 files, TypeScript and required project checks passed.
- [x] #39 — One-time local cache enrichment completed and verified on 2026-10-25; [PR #46](https://github.com/adrienZ/slopstagram/pull/46) closed unmerged by agreement. Persisted 155 location observations and 825 music observations; 941 uncertain occurrence associations remain unlinked; no invalid inputs or failures.
- [x] #40 — Historical map in the expanded location sticker dialog ([PR #47](https://github.com/adrienZ/slopstagram/pull/47), merged on 2026-10-26 as `51a198c`). Uses `react-map-gl/maplibre` with OpenFreeMap; marker popups show clickable story thumbnails in the existing viewer. Preserves the full table and exact labels, with separate counts for partial locations and stickers without a confirmed position. Validation: 225 tests, TypeScript, project checks, headed desktop/mobile checks, and PR CI passed.
- [ ] #41 — Spotify matching job and reliable track buttons.
- [ ] #42 — Automatic bunqueue scheduling and recovery.

Next: #41 (Spotify matching job and reliable track buttons), then #42 (automatic bunqueue scheduling and recovery). This parent remains open until the full specification is delivered.

Live-ingestion follow-up discovered during #39: mention-only Bloks wrapper IDs must not become place IDs. The corrected backfill excluded all 1,581 such entries, but the shared-parser fix remains only in `fd40af6` on the retained, unmerged `codex/cache-metadata-enrichment` branch. Retain that small correction on the integration branch before further live ingestion. The local backfill is complete; other databases require their own execution. Full evidence is recorded in #39.

## Problem Statement

Slopstagram retains Instagram story sticker labels, but those labels alone cannot
show where an account's tagged places are or reliably open the corresponding song
on Spotify. Raw Instagram story observations already contain some of the necessary
identifiers, coordinates, and music details, but their completeness varies and the
useful structured information is not preserved in the application database.

Users need to explore the places tagged throughout an account's retained history
and find its tagged music on Spotify without changing existing sticker labels,
losing repeated occurrences, re-fetching historical stories from Instagram, or
making story ingestion depend on external matching services.

## Solution

Deliver the feature in three independently verifiable milestones:

1. Preserve structured location and music metadata in relational tables, with
   separate tables for incomplete observations, and conservatively enrich existing
   stories from the raw story cache.
2. Add an interactive historical map above the existing table inside the account's
   expanded location sticker dialog.
3. Automatically match usable music metadata to Spotify through a dedicated
   bunqueue workload and expose a Spotify button for reliable matches in the
   account's music sticker card and expanded dialog.

Metadata is shared by a known Instagram place or audio asset identifier, while
each sticker occurrence and its exact existing label remain independent. Partial
observations can become usable automatically when later received information is
sufficient and their identity is certain.

## User Stories

1. As an account-history viewer, I want existing sticker labels to remain exactly unchanged, so that metadata enrichment does not alter the content I already recognize.
2. As an account-history viewer, I want repeated sticker occurrences to remain separate, so that repeated mentions of a place or song are not silently removed.
3. As an operator, I want the script and scheduled Nitro ingestion to preserve the same metadata, so that collection behavior does not depend on how a run starts.
4. As an operator, I want structured metadata stored in typed relational columns, so that the application can query and validate it without JSON blobs.
5. As an account-history viewer, I want stickers referring to the same Instagram place to share its metadata, so that repeated visits use consistent place information.
6. As an account-history viewer, I want stickers referring to the same Instagram audio asset to share its metadata, so that a Spotify match benefits every occurrence.
7. As an account-history viewer, I want different provider identifiers to remain distinct even when their names or labels match, so that homonymous places and different recordings are not confused.
8. As an operator, I want place metadata to require valid coordinates before it is considered usable, so that the map never relies on an invented position.
9. As an account-history viewer, I want a place's address to be optional, so that an otherwise mappable place remains available.
10. As an operator, I want usable music metadata to require an Instagram audio asset ID, title, and artist, so that shared identity and Spotify search have reliable inputs.
11. As an operator, I want Instagram sticker identifiers kept distinct from audio asset identifiers, so that different occurrences are not mistaken for different recordings.
12. As an operator, I want incomplete metadata retained separately, so that useful received information is not discarded merely because it is not yet usable.
13. As an account-history viewer, I want incomplete metadata to avoid creating invented or empty display labels, so that the existing sticker interface stays meaningful.
14. As an operator, I want partial observations without a shared provider identity kept separate, so that similar text does not cause speculative merging.
15. As an account-history viewer, I want partial metadata promoted automatically when later data makes it usable, so that newly available information benefits the application without manual cleanup.
16. As an operator, I want metadata promotion to preserve established occurrence links and remove superseded partial entries, so that promotion creates neither dangling references nor duplicate observations.
17. As an operator, I want missing or empty metadata fields to preserve known values, so that sparse responses do not degrade existing information.
18. As an account-history viewer, I want new live observations to update known metadata when they provide nonempty values, so that shared information can stay current.
19. As an operator, I want older cached observations to fill only missing fields, so that historical backfill does not overwrite newer metadata.
20. As an operator, I want to recover metadata from raw cached story fields even when calculated annotations are present, so that annotation precedence does not hide enrichment opportunities.
21. As an operator, I want backfill to enrich only stories already in the database, so that it does not unexpectedly restore missing stories.
22. As an operator, I want backfill to preserve story ownership, media, labels, and report data, so that an enrichment run cannot replace unrelated historical information.
23. As an operator, I want backfill to be rerunnable without duplicate records or links, so that interrupted or repeated runs are safe.
24. As an operator, I want uncertain historical occurrence associations left unlinked and reported, so that enrichment does not attach metadata to the wrong sticker.
25. As an operator, I want a backfill summary of enriched, partial, skipped, and uncertain items, so that I can understand the actual coverage.
26. As an account-history viewer, I want metadata links to survive occurrence reordering and subsequent ingestions, so that the correct place or song remains attached to its sticker.
27. As an operator, I want existing missing, empty, and malformed source semantics preserved, so that enrichment does not reintroduce lost annotations or erase valid contributions.
28. As an account-history viewer, I want the map available only when I expand the location sticker card, so that the account grid keeps its existing presentation.
29. As an account-history viewer, I want the map above the existing location table, so that I can explore geography and still inspect the complete history.
30. As an account-history viewer, I want the map to cover all retained account history, so that older stories are included rather than only the latest 24 hours.
31. As an account-history viewer, I want one point per distinct geolocated Instagram place, so that repeated occurrences do not create duplicate place markers.
32. As an account-history viewer, I want to select a point and see the place name and associated stories, so that a position leads back to its historical context.
33. As an account-history viewer, I want the existing story preview behavior available from associated stories, so that I do not need a separate media viewer.
34. As an account-history viewer, I want stickers without coordinates to remain in the table and existing counters, so that a map's incomplete coverage does not hide history.
35. As an account-history viewer, I want to understand how many locations cannot be positioned, so that missing points are distinguishable from an absence of tagged places.
36. As an account-history viewer, I want the dialog to remain useful when no places can be mapped, so that the historical table still works.
37. As an operator, I want the map to use only received Instagram coordinates, so that this version does not depend on an additional geocoding service.
38. As an operator, I want Spotify matching queued automatically for newly usable music and the eligible historical backlog, so that no per-song manual trigger is needed.
39. As an operator, I want matching to reuse the existing bunqueue server, so that the feature does not introduce a second queue-server lifecycle.
40. As an operator, I want matching work deduplicated by audio asset identity, so that repeated stickers do not repeatedly search for the same song.
41. As an operator, I want Spotify outages and missing configuration to leave ingestion operational, so that an optional external integration cannot interrupt story collection.
42. As an account-history viewer, I want a Spotify link only for a reliable match, so that the application does not silently substitute a remix, live version, cover, or unrelated recording.
43. As an operator, I want ambiguous and not-found outcomes distinguished from technical failures, so that rate limits and outages are not recorded as missing songs.
44. As an operator, I want retryable Spotify failures handled in the background with provider-aware delays, so that recovery does not require repeating story ingestion.
45. As an account-history viewer, I want a Spotify button beside a matched music label in both the account's music card and expanded dialog, so that I can open the corresponding track from either view.
46. As an account-history viewer, I want that button to open Spotify in a new tab, so that I retain my place in the account history.
47. As an account-history viewer, I want ambiguous and unmatched music to remain visible with its original label and no misleading Spotify link, so that unsuccessful matching does not remove sticker content.
48. As an operator, I want Spotify application credentials used only by the backend, so that catalog matching does not expose secrets or require every viewer to sign in to Spotify.

## Implementation Decisions

### Typed metadata, identity, and completeness

- Keep the current sticker occurrence model, kind, label, and source semantics.
  Add relationships to usable or partial metadata without changing existing label
  formatting, including existing name/address repetition. Preserve both occurrence
  multiplicity and source provenance.
- Add usable location and music metadata tables, conceptually
  `metadata_location` and `metadata_music`, plus one separate partial metadata
  table per kind. Partial tables mirror their kind's metadata fields with optional
  values; observation identity and provenance remain sufficient to track them.
  Store no application metadata or candidate lists as JSON blobs.
- Location metadata stores the Instagram place identifier, received name/address,
  latitude/longitude, and available external place identifiers. A valid finite
  latitude/longitude pair within geographical ranges is required for a usable
  location record. Address is optional. A label alone remains existing sticker
  data, not usable map metadata.
- Music metadata stores the Instagram audio asset identifier, title, artist,
  optional duration, optional Spotify track identifier, and matching state.
  Audio asset identifier, nonempty title, and nonempty artist are required for a
  usable music record. Missing or zero duration is unknown and does not supply
  positive evidence for matching.
- Preserve provider identifiers as exact strings. The outer Instagram music
  sticker ID and the nested audio asset ID are distinct identifiers. Never use
  the sticker ID as a substitute for shared audio asset identity.
- Share records only on matching provider place/audio asset identity. Textual
  equality of labels, place names, or title/artist pairs does not establish
  shared identity. Without that provider identity, keep partial observations
  separate; retain a provider sticker identifier when available.
- Metadata associations must survive source merges and changed sticker order.
  Do not use a previous dense sort position as the sole persistent identity, and
  do not collapse repeated occurrences with identical labels.
- Sparse or malformed responses never erase known rich metadata. Live nonempty
  observations may update it; older cache backfill fills missing values only.
  Receiving an incomplete observation does not demote an already usable record.
- Preserve the existing annotation source contract: omitted/null sources do not
  clear saved contributions; explicit empty sources remove their occurrences;
  malformed sources preserve saved contributions. An otherwise valid observation
  with missing metadata is retained as partial information without manufacturing
  a label or clearing a previously known sticker.
- Normal ingestion and historical backfill automatically promote an identifiable
  partial observation once required fields are available. Promotion is atomic,
  preserves established links, and removes the superseded partial entry. It must
  not initiate additional Instagram requests.
- Use a common enrichment workflow for script and scheduled ingestion. Keep
  table/entity definitions separate from repository queries, transactions, row
  mappings, and persistence helpers. UI components render prepared data and own
  local interaction behavior; business rules and orchestration remain in dedicated
  modules or hooks.

### Conservative cache backfill

- Read raw story observations from the existing per-story disk cache. This cache
  preserves API story fields and can also contain calculated annotations; those
  annotations must not prevent extraction from the raw location/music fields.
- Enrich only database stories that already exist. Do not re-fetch Instagram,
  recreate absent stories, or blindly replay the general story-save operation.
  Preserve ownership, media, existing labels, unrelated annotations, and historical
  report data.
- Associate metadata with an existing occurrence only when its identity can be
  established. Identical labels alone are insufficient. Leave uncertain
  occurrences unlinked and report them instead of guessing or inventing history.
- Make the operation rerunnable and report enriched, partial, skipped, and
  uncertain observations. Invalid cache inputs should be identifiable in the
  report without dumping raw responses or credentials.
- Application migrations run during server startup or through an explicit
  migration command. The backfill script requires an initialized database and
  must not trigger migrations, directly or indirectly. Tests may migrate their
  own isolated databases.

### Historical location map

- Put the map only in the account's expanded location-kind sticker dialog, above
  its existing complete historical table. Do not add a standalone page or a map
  to the collapsed/inline grid card.
- Include the account's complete retained timeline rather than applying the
  story feed's rolling 24-hour window. Prepare map data outside rendering
  components from the database-backed metadata relationships.
- Use one marker per distinct geolocated place identity. Selecting it exposes the
  place name and associated stories, reusing existing story previews.
- Preserve the full table, its labels, and existing occurrence/story counts,
  including unlocated stickers. Marker/place counts are distinct from occurrence
  and story counts. Provide an unlocated-location count and a useful empty-map
  state without removing historical content.
- Mount the map only when the location dialog opens. Preserve dialog keyboard,
  focus, scrolling, and preview interactions. Use received Instagram coordinates
  only; external geocoding is excluded.

### Queued Spotify matching

- Add a dedicated matching workload to the existing bunqueue infrastructure and
  standalone server. Reuse its lifecycle rather than starting another server.
- Automatically schedule eligible music received through ingestion, backfill, or
  partial promotion, and process the existing eligible backlog. Deduplicate
  pending work and reuse persisted results by Instagram audio asset identity.
  Reprocessing a completed job must not create conflicting or duplicate matches.
- Store processing state so that eligible work can be picked up after startup or
  transient queue/API failure. Story ingestion does not await Spotify completion
  and remains operational when matching is unavailable.
- Use server-side Spotify application credentials for catalog search, with a
  configurable catalog market. No viewer Spotify OAuth flow is required. Missing
  credentials leave matching waiting for configuration, not falsely not found;
  secrets must not be exposed to clients, stored in the issue, or logged.
- Compare returned candidates conservatively against title and artist; use a
  known duration as additional evidence and retain meaningful recording/version
  qualifiers. Never select the first result merely because it was ranked first,
  strip version distinctions to force a match, or invent a missing identifier.
  Multiple plausible recordings remain ambiguous.
- Distinguish pending/waiting for configuration, reliable match, ambiguous,
  not found, and technical failure. Only a reliable match exposes a Spotify link.
  Retry transient failures and respect provider rate-limit guidance; authentication
  or quota problems must not be converted into not-found results or tight retry
  loops. Do not requeue terminal outcomes merely for every repeated sticker.
- Show the Spotify button beside the unchanged music label in the account's
  music-kind card and expanded dialog. Open the track in a new tab without
  replacing the account page. Ambiguous/not-found entries retain their label
  without a Spotify button. No manual candidate-selection UI is included.

## Testing Decisions

The user explicitly approved three high-level test entry points: ingestion/cache
enrichment with isolated real SQLite; a queue job with simulated Spotify responses;
and account-page interactions for the map and Spotify buttons. Prefer these existing
boundaries to new low-level test-only interfaces.

- Test observable behavior, persisted state, and user interactions, rather than
  helper structure, private methods, call order, or snapshots of implementation.
  Use sanitized representative fixtures and deterministic provider responses.
- Extend the existing ingestion-to-cold-read annotation roundtrip tests: run a
  supplied Instagram client through the real ingestion boundary and isolated
  migrated SQLite, then read through a fresh repository. Assert exact preservation
  of labels, occurrence multiplicity, sources, ownership, and media alongside the
  added metadata and links.
- Cover shared provider identity across stories; different provider identities
  with the same text; distinction between sticker and audio IDs; valid/invalid
  coordinate pairs; missing addresses/durations; incomplete observations; promotion;
  and links that survive reordered or repeated source updates.
- Reuse existing partial-ingestion, source-clearing, malformed-source, and
  transactional rollback scenarios. Verify metadata additions preserve their
  externally visible guarantees and that promotion cannot leave dangling links.
- Test the backfill entry point with temporary cache fixtures and an initialized
  isolated database. Include annotated caches retaining useful raw fields, absent
  database stories, ambiguous duplicate labels, newer existing metadata, repeated
  runs, and failed inputs. Verify counters and that enrichment does not mutate
  unrelated story/report data or invoke migrations/Instagram.
- Exercise the Spotify job at its public processing boundary with real isolated
  persistence and a simulated Spotify adapter. Cover a reliable candidate, several
  plausible versions, no result, missing credentials, transient failure, quota/rate
  limits, retry timing, duplicate jobs, and shared results across occurrences.
- Follow the existing injected bunqueue factory/runtime tests for lifecycle,
  readiness, close behavior, and scheduling, while asserting the new queue's
  observable guarantees rather than copying its implementation. Include that
  Spotify failure does not stop successful story ingestion.
- Extend the existing rendered account-page interaction tests. Expand the location
  dialog and verify map-only placement, full historical scope, repeated places,
  located/unlocated mixtures, empty-map behavior, unchanged table/counts, marker
  selection, and story preview interactions. A deterministic map adapter can isolate
  provider rendering without mocking the feature's grouping/business rules.
- Verify Spotify button presence in both music views only for matched metadata,
  unchanged labels for every outcome, correct track target, and new-tab behavior.
- Use headed browser checks for actual map rendering, dialog layout, keyboard/focus,
  and story-preview behavior. Use the project's local Playwright CLI rather than
  assuming a global installation.
- Run the repository's required `npm run check` for code changes. Automated tests
  must not require live Instagram, Spotify credentials, or external tile servers.

## Out of Scope

- Changing existing sticker labels, including deduplicating repeated name/address
  text, or deduplicating repeated sticker occurrences.
- Replacing or removing existing source provenance and known-empty-source tracking.
- Re-fetching historical Instagram stories, reconstructing stories missing from
  the database, or speculatively matching historical occurrences by label text.
- External geocoding, guessing coordinates, inferring actual user movement, or
  interpreting a tagged place as confirmed device location.
- A standalone map page, an inline map in the account grid, or changes to other
  sticker-kind dialogs for mapping.
- An administrative partial-metadata editor, manual Spotify candidate selection,
  per-viewer Spotify login, playlists, playback, audio fingerprinting, or treating
  Instagram audio asset IDs as Spotify track IDs.
- Additional Instagram requests to complete partial metadata, title-only asset
  identity merging, a second standalone queue server, or a different queue system.
- Raw API payloads, Spotify candidate collections, or other application metadata
  stored as JSON database blobs.

## Further Notes

- Delivery order is metadata/cache enrichment, then the location map, then Spotify.
  Each milestone must remain independently usable and verifiable; this spec is the
  parent scope for a subsequent ticket breakdown, not that breakdown itself.
- The cache audit found frequent incomplete observations: some places provide
  only a provider ID, and some music observations have an outer sticker ID without
  an audio asset ID. These are expected partial-data cases, not evidence that the
  two identifier types are interchangeable. Cache totals are a moving snapshot
  and are not acceptance criteria.
- The agreed domain terms are Story, Sticker occurrence, Sticker label, Tagged
  place, Music asset, Partial sticker metadata, Account timeline, and Spotify match.
  Preserve the recorded architectural decisions on shared typed metadata,
  conservative historical enrichment, and asynchronous bunqueue matching.
- Spotify integration requires a configured developer application; development
  mode currently requires the app owner to have Premium. That setup can wait
  until the Spotify milestone and must not block the preceding two milestones.
  See Spotify's [quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).
- Server-side catalog authentication and search are documented by Spotify's
  [client credentials flow](https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow)
  and [search reference](https://developer.spotify.com/documentation/web-api/reference/search).
  Recheck provider contracts during implementation rather than hard-coding
  assumptions about undocumented limits or identifier semantics.
```

<!-- END ORIGINAL ISSUE 35 -->

## Issue #41 — Resolve one Spotify matching job and expose reliable track buttons

<!-- ORIGINAL ISSUE 41 FORMAT trailing-newlines=1 sha256=99b7b6c1378ee22fd2f216e259447e7e281f4ea6454fb38ae9486d4a2f490126 -->

<!-- BEGIN ORIGINAL ISSUE 41 -->

```markdown
## Parent

Part of [#35: Structured sticker metadata, account location map, and queued Spotify matching](https://github.com/adrienZ/slopstagram/issues/35).

## What to build

Make a single Spotify matching job turn a usable music asset into a persisted
matching outcome, and expose a Spotify button for a reliable result in the
account's music card and expanded dialog. This is the first complete processing
and display path; automatic queue scheduling and recovery follow in a separate
ticket, without adding a manual per-song interface.

## Acceptance criteria

- [ ] Expose one job-processing boundary that reads usable music metadata, calls an injectable server-side Spotify catalog adapter, and persists a typed result on the shared audio asset.
- [ ] Use backend application credentials and a configurable catalog market, with no per-viewer OAuth. Missing configuration produces a waiting/configuration outcome, not not-found; never expose credentials to browsers or logs.
- [ ] Compare title and artist conservatively, retain meaningful recording/version qualifiers, and use known duration as additional evidence. Do not choose the first result just because it ranked first or invent identifiers.
- [ ] Persist a reliable match only when supported; multiple plausible recordings remain ambiguous and a genuine successful no-match search is not-found.
- [ ] Keep pending/configuration, matched, ambiguous, not-found, and technical failure distinct in persisted processing outcomes, without JSON blobs or serialized candidate lists.
- [ ] A Spotify request failure never becomes a not-found result and never mutates sticker labels, occurrence identity, story ownership, or media.
- [ ] Cold account-history reads reuse the shared result for every linked occurrence, without per-sticker searches or raw cache reads.
- [ ] Show a Spotify button beside the exact existing label in both the account music-kind card and expanded dialog only for reliable matches. Open the correct track in a new tab while preserving the account page.
- [ ] Ambiguous, not-found, waiting, and failed entries retain their labels without a misleading Spotify button. No manual candidate-selection, playback, playlist, or viewer-login UI is introduced.
- [ ] Job-entry-point tests combine isolated SQLite and simulated Spotify responses for reliable matches, plausible variants, no result, unknown duration, missing credentials, and technical failure; account-page tests verify both button locations, target, new-tab behavior, and unchanged labels. Required project checks pass.

## Integration branch

Use `codex/sticker-metadata` as the shared feature integration branch. Base ticket
work on it and target ticket pull requests to it. Integrate this work into that
feature branch; do not merge ticket work directly into `main`. The final feature
merge into the default branch is outside this ticket.
```

<!-- END ORIGINAL ISSUE 41 -->

## Issue #42 — Automatically queue and recover Spotify matching with bunqueue

<!-- ORIGINAL ISSUE 42 FORMAT trailing-newlines=1 sha256=c8a217115bdaaa03d8618e23936d5e77aa7d3ab6f381b00d0caf255915da4923 -->

<!-- BEGIN ORIGINAL ISSUE 42 -->

```markdown
## Parent

Part of [#35: Structured sticker metadata, account location map, and queued Spotify matching](https://github.com/adrienZ/slopstagram/issues/35).

## What to build

Automatically drive the Spotify job through a dedicated bunqueue workload for
eligible live, promoted, and backfilled music, including the existing backlog.
Deduplicate work and recover from restarts, missing configuration, and provider or
queue failures while story collection remains independently operational.

## Acceptance criteria

- [ ] Reuse the existing standalone bunqueue server and application readiness/close lifecycle; do not spawn another queue server or replace the queue system.
- [ ] Newly usable music from shared live ingestion, partial promotion, and cache backfill becomes pending matching work automatically. Existing eligible database music is also discovered without per-song manual triggers.
- [ ] Deduplicate pending jobs and reuse persisted results by exact Instagram audio asset identity; repeated stickers, concurrent scheduling, and completed-job replay do not create duplicate/conflicting matches.
- [ ] Repeated occurrences do not requeue terminal matched/ambiguous/not-found outcomes merely because they are observed again.
- [ ] Persist/reconcile pending eligibility so a queue outage or process restart cannot permanently lose matching work. Do not wrap unrelated story collection in a Spotify job.
- [ ] Missing Spotify configuration leaves eligible work waiting; enabling valid configuration allows it to resume without re-ingesting stories or repeatedly failing in a tight loop.
- [ ] Retry transient provider failures with bounded backoff, respect Retry-After when supplied, and distinguish authentication/quota limitations from genuine not-found outcomes. Avoid immediate unbounded retries when the provider cannot serve work.
- [ ] A Spotify or queue outage does not prevent script/scheduled ingestion, cache enrichment, story persistence, or the account's existing history views from working.
- [ ] Run the same persisted outcome-to-button path built by the processing ticket; successful recovery makes the Spotify button appear for every linked occurrence on subsequent page reads.
- [ ] Lifecycle and scheduling tests follow the existing injectable queue/runtime pattern, while job integration tests use isolated SQLite and deterministic Spotify responses to verify duplicate work, restart recovery, missing configuration, transient/429 failures, and retry timing.
- [ ] An integration scenario starts with existing stories and cached music, runs conservative backfill, schedules/processes matching, and verifies the resulting account-view button without live provider access. Required project checks pass.

## Integration branch

Use `codex/sticker-metadata` as the shared feature integration branch. Base ticket
work on it and target ticket pull requests to it. Integrate this work into that
feature branch; do not merge ticket work directly into `main`. The final feature
merge into the default branch is outside this ticket.
```

<!-- END ORIGINAL ISSUE 42 -->
