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

### Generated UI

Treat `server/shadcn/**` as generated shadcn/ui code. Never hand-edit these files,
including formatting, imports, or lint fixes. Regenerate them through the shadcn CLI:

- Components: `npm exec --no-install -- shadcn add <components> --overwrite`.
- Preset and stylesheet: `npm run shadcn:generate`. This also applies the configured
  Tailwind prefix to CSS, which the CLI currently leaves unprefixed.

Put component styling in Tailwind classes and shared base CSS in
`server/assets/css/base.css`. Put behavior in callers or wrappers outside the
generated files. Keep generated files excluded from linting and formatting.

### Persistence layout

Put Drizzle tables, entity types, and table-derived validation schemas in
`sdk/entities/`. Keep `sdk/repositories/` focused on database access; put business
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
- Seed a database with `seedRecordedStories(recorded?, { database?, publishedBefore? })`
  from `tests/setup/seed.ts`. It runs real ingestion over recorded payloads
  (`readRecordedPayloads(names?)`). Change a recording with
  `editRecordedStories(recorded, (story, owner) => ...)`. Use `createTestDatabase(context)`
  from `tests/test-database.ts` for a small migrated in-memory database, and the real
  repositories for a case the recordings lack.
- Page tests: `createPageRenderer(route, props, path)` (`tests/render-page.ts`) renders the real
  route and answers only its loader. jsdom tests under `tests/ui/` seed the page database
  with `seedPageDatabase()` from `tests/ui/seeded-pages.ts`.
- Fixtures in `tests/fixtures/` come from `npm run fixtures:capture`, which anonymizes a live
  session. Never copy them from `data/cache` or the media cache. Never run the command in CI.
- Never write personal data into source, fixtures, tests, docs, commits, PRs or issues:
  usernames, ids, names, captions, places, CDN URLs. Use synthetic values. Only public audio
  metadata (titles, artists) may stay. `tests/fixtures.privacy.test.ts` runs
  `findUnsafeFixtureValues` over every fixture and fails on anything else.
- Name tests after the module they cover: `tests/<module>[.<aspect>].test.ts`, e.g.
  `stories.edge-cases.test.ts`.
- Coverage thresholds in `vitest.config.ts` raise themselves when `npm test` runs. Commit the
  change.

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
