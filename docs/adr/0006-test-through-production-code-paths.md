# Test through production code paths

Tests drifted from production. Page tests rendered props built by hand through
`getRankedUsers`, which the story feed no longer uses since report browsing became a
rolling feed. Those props had shapes real feed users never have. The mock Instagram
client returned the legacy `reels` map, so every fetch test skipped the `reels_media`
branch production takes. SSR tests replaced the route loader, and the report creation
test replaced almost every pipeline step. Nothing tested the database, loader and page
props seam, and coverage looked like 90% only because v8 ignores files no test loads;
counted over `sdk/` and `server/`, it was 88%. Six real bugs went through a green suite.
The spec is [issue #90](https://github.com/adrienZ/slopstagram/issues/90).

Tests go through two seams that already exist in the code:

1. A fetch run writes the data. Report creation runs the full ingestion pipeline (tray,
   story reels, parsing, stickers, tagged places, music assets, vision analysis, Apple
   captions, user summaries) into a migrated in-memory database.
2. The page loaders read it. The story feed and account timeline loaders run on that
   seeded database, and the real page renders their output.

Every other module (parser, validation schemas, repositories, sticker extraction, place
lookup, music assets, vision analysis, user summaries) is tested through these seams, not
on its own. Existing focused tests of pure functions may stay where they test behavior
through a public function. A good test asserts on what a user or the database would see
(page data, rendered content, stored story data, fetch run outcomes), never on which
internal function was called.

Tests do not mock our own code: no overrides of our pipeline steps and no replaced route
loaders or routers. Fakes are allowed only at external boundaries:

- the Instagram client, serving recorded payloads through the client option fetch runs
  already accept
- the Ollama client
- Apple OCR
- the Playwright browser session
- media downloads
- browser visual and media APIs that jsdom lacks (map rendering, canvas, audio playback)

A test seeds the database by running real ingestion over recorded payloads. The fake
client serves them in the real response shape, so they pass through the production
validation schemas and parser, and an outdated recording fails loudly. No separate
validation test is needed. A case the recordings lack may be inserted through the real
repositories.

Recorded payloads are captured on demand from a live authenticated session by a dedicated
command, never copied from the local story cache, which holds unredacted data. The
command anonymizes deterministically: the same real value always maps to the same
synthetic value, so links between payloads survive, and usernames, account ids, names,
captions and CDN URLs never reach the repository. Each fixture states when it was
captured and what it covers. The command never runs in CI, so CI never touches Instagram.

There is no end-to-end browser layer. Seeded integration tests cover the same ground
without building the app, starting a server or installing a browser, and keep the suite
fast enough to run before every commit. Revisit this only if a broken production build or
route wiring reaches production.

The legacy `reels` response shape is removed from the Instagram types together with the
parsing branch that reads it, so only the shape production receives can type-check.

Coverage counts every file in `sdk/` and `server/` except generated shadcn code, the
generated route tree and migrations. Thresholds sit just under the measured values and
raise themselves automatically (`autoUpdate`), so coverage can only rise. CI also runs
`knip --production`, so exports that only tests keep alive fail the build and are either
deleted or tested through their public interface.
