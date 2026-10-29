# Test through production code paths

Tests drifted from production. Page tests rendered props built by hand through
`getRankedUsers`, which the story feed no longer uses since report browsing became a
rolling feed (359f16a). Those props had shapes real feed users never have, such as
filled `reel_ids` and a null sidebar avatar. The mock Instagram client returned the
legacy `reels` map, so every fetch test skipped the `reels_media` branch production
takes. SSR tests replaced the route loader. Nothing tested the database → loader →
page props seam, and coverage looked like 90% only because v8 ignores files no test
loads; counted over `sdk/` and `server/`, it was 88%.

Most tests are in-process integration tests. A test migrates an isolated `:memory:`
database, fills it through production code, and asserts on what production code
returns: repositories, loaders, and the rendered route with its real loader. Data is
seeded by running the report pipeline (`createReport` → `fetchStories`) over the
recorded Instagram payloads in `tests/fixtures/`, with a recorded client that returns
the real `reels_media` shape. Only the steps that need the network, macOS services or
local models (media caching, Apple captions, vision, summaries) are skipped. Tests
that need a case the recordings lack insert it through the repositories, not by typing
view models. Doubles stay at true process boundaries: Instagram, Ollama, the file
system cache, and the clock.

There is no end-to-end layer for now. A Playwright smoke test (build the app, seed a
database file, start the built server without the warm-cache job, check both pages,
navigation and the `?story=` redirect) measured at about 9 s locally, plus a Chromium
install in CI. It would catch broken production builds and route wiring, which
in-process tests cannot. Revisit it if such a break reaches production.

Recordings must not drift either. A test parses every recorded payload with the
production Zod schemas, and a script refreshes the recordings from `data/cache` with
personal data replaced. Types reject shapes Instagram no longer returns, for example
`ReelsMediaResponse` accepts only `reels_media`. `knip --production` lists exports only
tests keep alive; each one is either deleted with its tests or kept as a deliberate
test seam.

Coverage counts every file in `sdk/` and `server/` except generated shadcn code, the
route tree and migrations. Thresholds sit just under the measured figures, so coverage
can only rise.
