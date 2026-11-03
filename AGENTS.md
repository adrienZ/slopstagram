## General rules

Even if I talk to you in french always use english when writing a issue, commit or a PR on Github.

## Bunqueue

This project runs on Node.js and uses [bunqueue](https://bunqueue.dev) in server
mode. The standalone bunqueue server still requires Bun.

You can discover the CLI tool using `npm exec --no-install -p -- bunqueue --help`. The Nitro server plugin starts the standalone bunqueue server automatically.

Humans can explore the [dashboard](https://egeominotti.github.io/bunqueue-dashboard/docs/quickstart) running `npx bunqueue-dashboard`.

## Code changes

Make sure to run `npm run check` to validate your code changes.

Keep UI components limited to rendering, local UI behavior, and presentation transformations; place business rules and application orchestration in hooks/composables or dedicated modules.

### Where code goes

- `app/`: the TanStack Start app. `routes/` holds only route files, `loaders/` the server-only
  loader of each page (it owns the page data type and returns data ready to render), `utils/`
  display helpers shared by components.
- `server/`: Nitro only, the media route and the plugins.
- `core/`: domain and ingestion code, with no React and no Nitro.
- `core/runtime/`: the composition root. `createRuntime` builds the repositories once from a
  database and the external boundaries (Instagram client, image and media downloads, Ollama,
  Apple OCR, storage, logger, queue). `getProductionRuntime` creates the production one on first
  use, and that call is what opens the database. Only the server function behind each page, the
  Nitro plugins, the fetch-run job and the scripts call it. Time (the clock and the retry sleep)
  is not a boundary.

### Dependencies and options

A step is called with its dependencies first, its input next and its options last. Dependencies
are who the step talks to, options are how: tunables with defaults, such as retry attempts or the
clock. An options object never holds a collaborator.

The dependencies argument is a view of the runtime narrowed to the repository methods the step
calls, for example `{ stories: Pick<StoryRepository, "listActive"> }`, or
`Pick<Runtime, "logger">` for the other parts. The real runtime and the test runtime satisfy it
without a cast. Each collaborator has one name across the code base (`fetchOllama`, `storage`).

No module opens the database or a store, or builds a repository, when it is imported. A
`no-restricted-imports` override in `oxlint.config.ts` only lets `core/runtime` import repository
classes, `createDrizzle` and `createFileCacheStorage` (and `core/database` and `core/media-store`
the drivers behind them); tests are exempt.

### Generated UI

Treat `app/shadcn/**` as generated shadcn/ui code. Never hand-edit these files,
including formatting, imports, or lint fixes. Regenerate them through the shadcn CLI:

- Components: `npm exec --no-install -- shadcn add <components> --overwrite`.
- Preset and stylesheet: `npm run shadcn:generate`. This also applies the configured
  Tailwind prefix to CSS, which the CLI currently leaves unprefixed.

Put component styling in Tailwind classes and shared base CSS in
`app/assets/css/base.css`. Put behavior in callers or wrappers outside the
generated files. Keep generated files excluded from linting and formatting.

### Persistence layout

Put Drizzle tables, entity types, and table-derived validation schemas in
`core/database/entities/`. Keep `core/database/repositories/` focused on database access; put business
logic in domain modules. Import repositories directly from their modules.

Derive database-shaped validators from `drizzle-orm/zod` and reuse them.

## playwright

@playwright/cli is not globally installed. Always use the local package with the command separator: `npm exec --no-install -p @playwright/cli -- [command]`, always use headed mode.

To close existing instance of playwright browser, you can use the `kill-all` command.

instagram.com is an SPA application so make to wait loaded / idle state.

## Database

No JSON blob please

Run application migrations during server startup in `server/plugins/database.ts`
or explicitly with Drizzle Kit's `migrate` command.
Scripts in `scripts/` require an initialized database and must not trigger migrations,
directly or through SDK calls. Tests may migrate their isolated databases.

## Testing

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
- Name tests after the module they cover: `tests/<module>[.<aspect>].test.ts`, e.g.
  `stories.edge-cases.test.ts`.
- `npm test` raises the coverage thresholds in `vitest.config.ts` (`autoUpdate`). Commit the
  rewrite.

## Agent skills

### Issue tracker

Track issues and specs in GitHub Issues for `adrienZ/slopstagram`.
Before issue operations, read `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels.
Before triage, read `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout: root `GLOSSARY.md` and `docs/adr/`.
Before codebase exploration, read `docs/agents/domain.md`.

<!-- sonar:begin:codex-secrets-on-read -->
# SonarQube secrets scanning for files protocol

Before reading any file in this workspace, scan it for secrets with the deterministic scanner:

```bash
sonar analyze secrets <path/to/file>
```

If the command reports that the file contains a secret, **do not read the file**. Instead:

1. Inform the user that the file appears to contain a secret or credential and that reading it would expose the value in chat history, logs, and any downstream telemetry.
2. Advise them to rotate the leaked credential at its source of truth and remove it from the file.
3. Do not proceed with the original request until the secret has been removed.

## Local cache

However, you can bypass `data/cache/**`: cached Instagram payloads. These payloads are large, so extract only the keys you need with `jq` and print nothing else.

<!-- sonar:end:codex-secrets-on-read -->
