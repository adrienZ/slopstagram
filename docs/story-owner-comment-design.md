# Story owner comment: feature design

Date: 2026-11-01. Evidence: [story-owner-comment-post-analysis.md](story-owner-comment-post-analysis.md).
Decision record: [ADR 0007](adr/0007-collect-story-owner-comments-at-ingestion.md).

## Goal

Keep the short text a story owner attaches to their own story, so the story feed and
the account timeline can later show what the mobile app shows. A comment is only
fetchable while the story is live, so collection must happen during ingestion.

## Scope

In this change:

- Collect an **owner comment** for every story saved by a fetch run.
- Store it durably, independent of the story cache.
- Read it back through `StoryRepository`.

Not in this change:

- Showing owner comments in the feed, the account timeline or reports.
- Collecting comments by other people.
- Backfilling stories already stored: expired stories can no longer be queried.

## Terms

**Owner comment**: a comment written by a story's own account on that story. Instagram
marks it `is_created_by_media_owner`. See `GLOSSARY.md`.

## Data model

One table, `story_owner_comments`, in `sdk/entities/story-owner-comment.ts`.

| Column      | Type              | Notes                                                               |
| ----------- | ----------------- | ------------------------------------------------------------------- |
| `commentPk` | text, primary key | Instagram's comment id, kept as a string (ids exceed safe integers) |
| `mediaPk`   | text, not null    | References `stories.mediaPk`, cascades on delete                    |
| `text`      | text, not null    | The comment as written, emoji included                              |
| `createdAt` | integer, not null | Seconds since epoch, as Instagram reports it                        |

An index on `(mediaPk, createdAt)` serves the per-story read. A story can have several
owner comments. Typed columns only: no JSON blob. The migration is additive and
creates a new table, so it cannot affect existing rows.

## Collection flow

`fetchStoriesManifest` calls `collectOwnerComments` after saving stories and looking up
places, for the stories saved in this run only:

1. Read the story's inline `story_comments` from the reels-media payload. Keep the
   comments flagged as created by the media owner.
2. If none, ask `client.getStoryComments(mediaPk)`, which calls
   `GET /api/v1/media/{mediaPk}/comments/` through the authenticated page. Keep the
   owner-flagged comments.
3. Upsert by `commentPk`. Re-ingesting a story updates the same row.

Both sources go through the same parser, so a comment looks identical whichever path
delivered it.

```text
reels-media payload --story_comments--> parse + owner filter --\
                                                                 >--> upsert story_owner_comments
comments endpoint --comments----------> parse + owner filter --/
```

## Failure handling

Owner comments are a best effort add-on: they never fail a fetch run.

| Condition                                    | Behavior                                                        |
| -------------------------------------------- | --------------------------------------------------------------- |
| HTTP 401, 403 or 429                         | Log a warning and stop all further comment requests in this run |
| Other non-OK status                          | Skip that story, keep going                                     |
| Non-JSON or malformed response, thrown error | Log "owner comment lookup failed", keep going                   |
| Storing a comment fails                      | Log a warning, keep going                                       |
| Client or repository lacks the capability    | Do nothing, as place lookup does                                |

Requests are sequential, like place and music lookups.

## Alternatives considered

- **Read only the inline `story_comments`.** Zero extra requests, but it missed the
  comment of story A in the post-analysis entirely, which was the original problem.
- **Store the comment on the `stories` row.** Simpler, but a story can have several
  comments and the comment arrives after the story, which would couple its updates to
  story saves.
- **Re-read the story cache to backfill.** Cached payloads only contain what Instagram
  returned at first fetch; for story B in the post-analysis that included the comment,
  but it cannot find late comments. Unlike [ADR 0002](adr/0002-enrich-existing-stories-from-cache.md),
  nothing here replays the cache.
- **Fetch only for the signed-in account's own stories.** Fewer requests, but the
  analysis could not confirm that the inline field is what differs for own stories, so
  this would risk missing comments for other accounts.

## Open questions

- **Request volume.** One extra request per new story without an inline comment.
  Measure over several runs. If Instagram throttles it, restrict the call to stories
  published within the last day, or to accounts known to comment.
- **Late comments.** A comment posted after a story was first fetched is missed unless
  the story is fetched again. A follow-up could re-check live stories on every run, at
  the cost of more requests.
- **Display.** Where an owner comment appears on a story card, and how it relates to
  the accessibility caption and sticker labels, is a product decision for a follow-up.

## Verification

Tests follow [ADR 0006](adr/0006-test-through-production-code-paths.md): they run
`fetchStoriesManifest` against a migrated in-memory database and read the result back
through `StoryRepository`. The Instagram client is the only fake. Covered cases:

- inline owner comment stored, other people's comments ignored, no extra request;
- comment fetched from the endpoint when the payload has none;
- story with no comments;
- re-ingestion does not duplicate a comment;
- failing request does not stop ingestion;
- rate limit stops further requests.

`tests/story-client-service.test.ts` checks the endpoint URL and that large comment ids
stay exact.
