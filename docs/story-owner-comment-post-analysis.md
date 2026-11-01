# Story owner comment: post-analysis

Date: 2026-11-01. Design: [story-owner-comment-design.md](story-owner-comment-design.md).

The mobile app shows a short text on some stories, such as a few words or a single
emoji. Slopstagram never stored it. This document records where that text lives in
Instagram's payloads, how it was located, and what is still unverified. The requests
below are Instagram's internal web API, not a stable public one, and the observations
describe this session and two sampled stories (called story A and story B). Account
names, identifiers and the comment texts are deliberately left out.

## Conclusion

The text is a **comment posted by the story owner on their own story**. Instagram's
web API exposes it as a comment with `is_created_by_media_owner: true`, not as a
sticker, caption or text overlay.

| Story   | Where the text was found                                             |
| ------- | -------------------------------------------------------------------- |
| Story A | `comments[0].text` of `GET /api/v1/media/{mediaPk}/comments/`        |
| Story B | `story_comments[0].text` inside the cached reels-media story payload |

Both comments carry `is_created_by_media_owner: true`, a `user_id` equal to the story
owner, and a `created_at` after the story's `taken_at`: seconds for story B, about
twenty minutes for story A.

## What was ruled out for story A

| Check                                                                             | Result                                                                                                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cached story payload                                                              | The text is absent. `story_comments` is `null`                                                                                                                      |
| Sticker, caption and annotation fields in the cached payload                      | `caption`, `story_music_stickers`, `story_questions`, `story_link_stickers`, `story_bloks_stickers` and `annotations.stickers` are all empty                        |
| The preview image                                                                 | A photo with no text. Apple Vision OCR returned nothing. `accessibility_caption` says the image may contain text, although no text is present                       |
| Live refetch through the app's own reels-media GraphQL query (HTTP 200)           | `story_comments` is an empty array and every sticker field is null. The story was still live                                                                        |
| Instagram web viewer                                                              | The story URL redirects to the home feed and the owner's profile shows no story ring, so the overlay cannot be observed there. Network responses contained no match |
| Profile Note                                                                      | Only the "Note…" placeholder, so it is not a Note                                                                                                                   |
| `GET /api/v1/feed/reels_media/?reel_ids=<owner>`                                  | HTTP 500                                                                                                                                                            |
| `GET /api/v1/feed/user/<owner>/story/`                                            | HTTP 200, about 800 KB, no match                                                                                                                                    |
| `GET /api/v1/media/<mediaPk>/comments/` (with or without the `_<ownerPk>` suffix) | HTTP 200, `comment_count: 1`, and `comments[0].text` is the text seen in the app                                                                                    |

## Story B

The cached payload of story B, a video, holds its text in `story_comments[0].text` with
`is_created_by_media_owner: true`. Instagram returned it inline in the reels-media
payload, so it was captured only because the raw story was cached while the story was
live.

Asking the comments endpoint about that story months later returns an HTML page with
HTTP 200, not JSON. The comments of an expired story cannot be fetched afterwards,
which makes ingestion during the 24-hour window the only chance to keep them.

## Why Slopstagram missed it

1. **Nothing read `story_comments`.** The story schema keeps unknown keys as raw JSON
   through `catchall`, so the field survived in the story cache, but no table or
   service consumed it. Story B's text sat unused in the cache for months.
2. **The inline field is unreliable.** For story A the same query that returned an
   inline comment for story B returned none. Two samples cannot say whether the cause
   is the viewer being the owner, the comment's age at fetch time, or Instagram's
   rollout. It is unverified.
3. **The cache hides late comments.** A story is cached once, when first fetched. A
   comment posted afterwards, as story A's was, is never seen by a cache-first
   pipeline even if the field were reliable.

## What the investigation could not establish

- Whether `story_comments` is inline only for other accounts' stories.
- Whether a comment added after the first fetch ever appears in a later reels-media
  response.
- Whether the comments endpoint answers for every account, or only for stories the
  signed-in account may see.
- Whether a story can hold several owner comments. The model allows it.
- Request volume: the endpoint is asked once per newly saved story without an inline
  comment. Instagram's rate limit behavior for it is unmeasured.

## Method notes

- Cached payloads were queried with `jq` only, as the repository requires for
  `data/cache/**`.
- The live checks used the saved Playwright profile through the app's own session
  helper, headed. Scratch scripts were kept outside the repository.
- The story image was downloaded once to a scratch directory for OCR and not kept in
  the repository.
