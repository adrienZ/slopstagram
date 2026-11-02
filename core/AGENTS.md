# core

Domain and ingestion code, with no React and no Nitro. One flat folder per domain, with no
subfolders except in `database/`.

## Imports

- Inside a domain, import with relative paths. Across domains, import with
  `@@/core/<domain>/<module>.ts`.

## Domains

- `utils/`: domain-free helpers (data paths, JSON values, logging, provider identifiers, caption
  placeholders). Imports no domain; nothing domain-specific goes here.
- `database/`: the client, migrations, `entities/` and `repositories/`. No business rules.
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
