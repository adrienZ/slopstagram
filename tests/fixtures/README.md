# Test fixtures

Recorded Instagram payloads are captured from a live authenticated session with
`npm run fixtures:capture`, never copied from `data/cache`. The script keeps the first
three tray entries, one place and one music asset, and replaces usernames, names,
identifiers, URLs, captions, coordinates and any other free text with stable synthetic
values. It runs on demand only. Update the table below after each capture.

| File | Captured | Covers |
| --- | --- | --- |
| `instagram-story-data.json` | 2026-07-25 (first commit; anonymized by hand, not by the capture script) | One `reels_media` gallery page: an image story with two mention stickers, two video stories with music stickers, one malformed `story_bloks_tappables` entry. `has_next_page` is true, so the production client asks for a next page. |
| `audio-clip.m4a`, `video-clip.mp4` | 2026-10-27 | Tiny generated media files, not Instagram payloads. |

Missing from the recordings, so tests insert it through the repositories: a location
sticker, a story caption, a failure page, a place lookup response and a music asset
response. A capture adds them.
