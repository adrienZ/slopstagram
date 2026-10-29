# Test through production code paths

Tests drifted from production. Page tests rendered props built by hand through
`getRankedUsers`, which the story feed no longer uses since report browsing became a
rolling feed (359f16a). Those props had shapes real feed users never have, such as
filled `reel_ids` and a null sidebar avatar. The mock Instagram client returned the
legacy `reels` map, so every fetch test skipped the `reels_media` branch production
takes. SSR tests replaced the route loader. Nothing tested the database → loader →
page props seam, and coverage looked like 90% only because v8 ignores files no test
loads; counted over `sdk/` and `server/`, it was 88%. The spec is issue #90.

Tests run against a seeded database and go through the real loaders and real pages.
There is no end-to-end layer: seeded integration tests cover what it would, without
building the app, starting a server or installing a browser. A Playwright smoke test
measured about 9 s locally; revisit it only if a broken production build or route
wiring reaches production.

Tests do not mock our own code. Fakes are allowed only at external boundaries: the
Instagram session (it serves recorded response bodies), Ollama, Apple OCR, the
Playwright session, bunqueue, and browser visual and media APIs that jsdom lacks (the
map canvas, canvas, audio). No `dependencies` overrides of our modules and no swapped
loaders. Where production reaches a boundary through a framework, the seam is injection:
route loaders read their queries from the router context, production passes the server
functions, and tests pass in-process calls to the functions they wrap, because server
functions only run inside the Start server.

A test seeds the database by running real ingestion over recorded payloads. The fake
browser session answers with recorded bodies, the real `createInstagramClient` parses
them, and the real fetch and user persistence store them in a migrated `:memory:`
database. Recordings therefore pass through the production Zod schemas, and a stale
recording fails loudly; no separate validation test is needed. A case the recordings
lack is inserted through the real repositories. jsdom cannot open SQLite, so a Vitest
`globalSetup` computes the page props once in Node, from the same seed, and provides
them to the UI project.

Recordings live in `tests/fixtures/` and are never copied from `data/cache`, which holds
unredacted data. `npm run fixtures:capture` records the tray, reels media, place and music
asset responses from a live authenticated session, keeps only the first reels, and
replaces everything that could identify someone with stable synthetic values (default
deny: a string survives only under a structural key). It runs on demand, never in CI.
`tests/fixtures/README.md` says when each file was captured and what it covers.

The legacy `reels` response shape is gone: `ReelsMediaResponse` is `reels_media` as an
array, as `createInstagramClient` returns it, and `extractReels` and the story parsers
that read the old shape are removed. `knip --production` runs in `check` and `check:ci`,
so code only tests keep alive fails the build. A test seam production does not need is
tagged `@public` with the reason, which keeps the list of seams explicit.

Coverage counts every file in `sdk/` and `server/` except generated shadcn code, the
route tree and migrations. Thresholds raise themselves with `autoUpdate`, so coverage
can only rise.
