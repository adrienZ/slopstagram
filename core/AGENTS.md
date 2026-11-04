# core

Domain and ingestion code, with no React and no Nitro. Each domain is one flat folder under
`domains/`, with no subfolders. Outside `domains/`, only `database/` has subfolders.

## Shared folders

These sit next to `domains/` because they are not domains.

- `utils/`: domain-free helpers (data paths, JSON values, logging, provider identifiers, caption
  placeholders). Imports no domain; nothing domain-specific goes here.
- `database/`: the client, migrations, `entities/` and `repositories/`. No business rules.
- `runtime/`: the composition root, and the types of the external boundaries it exposes (`fetch-boundaries.ts`). It imports every domain; only entry points import its values, other modules import its types.

## Domains

Every folder below lives in `domains/`.

- `instagram/`: Instagram payload types, the story client, retry, the Playwright session, the
  story parser and payload validation. No persistence.
- `media-store/`: the local copies of images and audio the app serves. Not the story cache.
- `stickers/`: story annotations, sticker and location extraction, story model types.
- `places/`: tagged place metadata, observations and place lookups.
- `music/`: music assets and media, music observations, story audio, DASH audio.
- `vision/`: the Ollama client, vision analysis, Apple OCR and the Apple caption step.
- `accounts/`: user summaries, Instagram user persistence and report user keys.
- `story-feed/`: the story feed and story days.
- `fetch-run/`: the fetch run pipeline, reports, story fetching, the story cache and the hourly
  job.

## Repositories

A repository is a class built from a database (`new XRepository(db)`, plus a logger where it has
one), with methods named for domain reads and writes. Only `runtime/` builds repositories.
Services take the runtime, narrowed to the repository methods they call, never a raw database or
a helper module.
