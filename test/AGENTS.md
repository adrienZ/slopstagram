# tests

Tests go through production code paths (`docs/adr/0006-test-through-production-code-paths.md`).

- Fix a bug by writing the failing test first.
- Never mock project code: no `vi.mock` or `vi.spyOn` of our modules, no fake repositories,
  no replaced loaders or routers. Fake only external boundaries: the Instagram client, Ollama,
  Apple OCR, the Playwright session, media downloads, and browser APIs jsdom lacks (map
  rendering, canvas, audio playback).
- Fake the network with MSW: `createMockServer()` (`test/setup/mock-server.ts`) fails on any request
  without a handler. Fake other globals jsdom or Node lack with `mockJsdomPolyfillValue` (restored when the
  test ends) or `defineJsdomPolyfill` (installed for the run) from `test/setup/define-property.ts`. Spies
  only observe: no `vi.fn(impl)`, `mockImplementation` or `vi.stubGlobal`
  (`landmines-testing/no-test-doubles`).
- Seed test data by running real ingestion over recorded payloads, never by building rows by
  hand (`test/setup/seed.ts`). Edit a recording to shape a case. For a case the recordings
  lack, use a small migrated in-memory database and the real repositories
  (`test/test-database.ts`).
- Runtime in tests: `createTestRuntime(context, boundaries)` (`test/setup/test-runtime.ts`) gives
  a runtime over a fresh migrated in-memory database and in-memory stores; a test overrides only
  the external boundary it needs. Read-only tests of a file share one runtime with
  `shareTestRuntime(seed)`. Control time with vitest fake timers, not an injected clock.
- Page tests: `createPageRenderer(route, props, path)` (`test/render-page.ts`) renders the real
  route and answers only its loader, which the test calls with its runtime. jsdom tests under
  `test/ui/` seed it with `seedPageDatabase(runtime)` from `test/ui/seeded-pages.ts`. Tests of
  the mention graph and of its Assistant tools seed it from `test/setup/mention-graph-seed.ts`.
- Fixtures in `test/fixtures/` come from `npm run fixtures:capture`, which anonymizes a live
  session. Never copy them from `data/cache` or the media store, and never run the command in
  CI. Never write personal data into source, fixtures, tests, docs, commits, PRs or issues:
  usernames, ids, names, captions, places, CDN URLs. Use synthetic values. Only public audio
  metadata (titles, artists) may stay. `test/fixtures.privacy.test.ts` fails on any other
  value in a fixture.
- Oxlint rule tests live in `test/oxlint/<rule>.test.ts`, run with `RuleTester` over the rule in
  `oxlint/plugins/rules/`.
- `test/source.privacy.test.ts` fails when a tracked or untracked source file (code, tests, docs)
  names an account of your local database (`data/slopstagram.sqlite`) as a whole word of six
  characters or more. It prints only the file and line. It is skipped where that database does not
  exist, such as in CI, so run `npm test` locally before you commit.
- Name tests after the module they cover: `test/<module>[.<aspect>].test.ts`, e.g.
  `stories.edge-cases.test.ts`.
- `npm test` raises the coverage thresholds in `vitest.config.ts` (`autoUpdate`). Commit the
  rewrite.
