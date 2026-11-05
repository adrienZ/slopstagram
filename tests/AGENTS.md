# tests

Tests go through production code paths (`docs/adr/0006-test-through-production-code-paths.md`).

- Fix a bug by writing the failing test first.
- Never mock project code: no `vi.mock` or `vi.spyOn` of our modules, no fake repositories,
  no replaced loaders or routers. Fake only external boundaries: the Instagram client, Ollama,
  Apple OCR, the Playwright session, media downloads, and browser APIs jsdom lacks (map
  rendering, canvas, audio playback).
- Seed test data by running real ingestion over recorded payloads, never by building rows by
  hand (`tests/setup/seed.ts`). Edit a recording to shape a case. For a case the recordings
  lack, use a small migrated in-memory database and the real repositories
  (`tests/test-database.ts`).
- Runtime in tests: `createTestRuntime(context, boundaries)` (`tests/setup/test-runtime.ts`) gives
  a runtime over a fresh migrated in-memory database and in-memory stores; a test overrides only
  the external boundary it needs. Read-only tests of a file share one runtime with
  `useSharedTestRuntime(seed)`. Control time with vitest fake timers, not an injected clock.
- Page tests: `createPageRenderer(route, props, path)` (`tests/render-page.ts`) renders the real
  route and answers only its loader, which the test calls with its runtime. jsdom tests under
  `tests/ui/` seed it with `seedPageDatabase(runtime)` from `tests/ui/seeded-pages.ts`.
- Fixtures in `tests/fixtures/` come from `npm run fixtures:capture`, which anonymizes a live
  session. Never copy them from `data/cache` or the media store, and never run the command in
  CI. Never write personal data into source, fixtures, tests, docs, commits, PRs or issues:
  usernames, ids, names, captions, places, CDN URLs. Use synthetic values. Only public audio
  metadata (titles, artists) may stay. `tests/fixtures.privacy.test.ts` fails on any other
  value in a fixture.
- Oxlint rule tests live in `tests/oxlint/<rule>.test.ts`, run with `RuleTester` over the rule in
  `oxlint/plugins/rules/`.
- Name tests after the module they cover: `tests/<module>[.<aspect>].test.ts`, e.g.
  `stories.edge-cases.test.ts`.
- `npm test` raises the coverage thresholds in `vitest.config.ts` (`autoUpdate`). Commit the
  rewrite.
