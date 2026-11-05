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

- `app/`: the TanStack Start app. `routes/` holds only route files: pages, and server routes
  (`server.handlers`, e.g. `routes/media/$.ts`) that stay thin adapters over `core/`. `loaders/`
  holds the server-only loader of each page (it owns the page data type and returns data ready to
  render), `utils/` display helpers shared by components.
- `nitro/`: Nitro plugins only (startup migrations, the bunqueue server), for what has no TanStack
  Start equivalent. No routes: every route lives in `app/routes/`.
- `core/`: domain and ingestion code, with no React and no Nitro.
- `evals/`: the local Assistant evaluations (see "Evals" below).

### Chat Assistant

The chat page (`app/routes/chat.tsx`) posts to `app/routes/api/chat.ts`, a thin adapter over `core/domains/assistant/` that tests drive with only Ollama faked, using the `OLLAMA_CHAT_MODEL` model. Assistant tools live in their domain, one per `<tool-name>.tool.ts` (`docs/adr/0007-assistant-tools-live-in-their-domain.md`), and only those, `core/domains/assistant/`, `app/hooks/use-assistant-chat.ts`, tests and `evals/` may import the AI SDK (the `slopstagram/ai-sdk-imports` lint rule).

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
`core/domains/database/entities/`. Keep `core/domains/database/repositories/` focused on database access; put business
logic in domain modules. Import repositories directly from their modules.

Derive database-shaped validators from `drizzle-orm/zod` and reuse them.

## playwright

@playwright/cli is not globally installed. Always use the local package with the command separator: `npm exec --no-install -p @playwright/cli -- [command]`, always use headed mode.

To close existing instance of playwright browser, you can use the `kill-all` command.

instagram.com is an SPA application so make to wait loaded / idle state.

## Database

No JSON blob please

Run application migrations during server startup in `nitro/plugins/database.ts`
or explicitly with Drizzle Kit's `migrate` command.
Scripts in `scripts/` require an initialized database and must not trigger migrations,
directly or through SDK calls. Tests may migrate their isolated databases.

## Testing

Test rules live in `tests/AGENTS.md`.

## Evals

`npm run eval` runs the [Evalite](https://evalite.dev) suites in `evals/*.eval.ts` once and exits:
the real chat model answers the target prompts through the chat route handler, over the synthetic
report world of the tests (`evals/assistant-world.ts`, report creation with a fake Ollama). Each
case runs 5 times; the deterministic scorers of `evals/assistant-scorers.ts` decide whether a run
passed, and the run fails when a case's pass rate is under its threshold. Configuration lives in
`evalite.config.ts`; results stay in memory.

- Besides the scorers the spec lists (tool, arguments, no invented account, non-empty answer), the
  "Expected outcome" scorer checks the tool result the stream showed (found, the missing reason or
  `unknown_account`), and "Answer in French" is a deliberate addition: the Assistant replies in the
  user's language. Whether the answer says the account is unknown is left to the judge.
- The threshold (3/5) is the baseline of the default chat model: raise it when the model improves.
- Prerequisites: the Ollama server running (`curl localhost:11434/api/version`) with the chat model
  pulled (`OLLAMA_CHAT_MODEL`, defaulting to the user summary model, e.g. `ollama pull qwen3.5:0.8b`).
- Optional LLM judge: set `EVAL_JUDGE_MODEL` to a Codex model id (suggested: `gpt-6.1-terra`,
  e.g. `EVAL_JUDGE_MODEL=gpt-6.1-terra npm run eval`; `codex debug models` lists the ids) and
  install the `codex` CLI. The Codex login must have access to that model, or every judged run
  fails with `model_not_found`. Without either, the judge is skipped. It runs Codex in an empty temporary directory, read-only, never
  approving an action.
- Evals are not tests: `npm run check`, `npm test`, coverage and CI never run them, and they need
  no model to pass. Do not run `evalite watch` or `evalite serve` in an agent session: they keep
  a server running.
- Only synthetic data may reach the chat model and the judge: cases and seeded data come from the
  synthetic report world, never from `data/`, the application database or real accounts. Never
  add personal data to a case.

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
