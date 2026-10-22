## Bunqueue

This project runs on Node.js and uses [bunqueue](https://bunqueue.dev) in server
mode. The standalone bunqueue server still requires Bun.

You can discover the CLI tool using `npm exec --no-install -p -- bunqueue --help`. The Nitro server plugin starts the standalone bunqueue server automatically.

Humans can explore the [dashboard](https://egeominotti.github.io/bunqueue-dashboard/docs/quickstart) running `npx bunqueue-dashboard`.

## Code changes

Make sure to run `npm run check` to validate your code changes.

### Persistence layout

Put Drizzle table definitions and entity types in `sdk/entities/`. Keep repository
classes, database queries, transactions, row mappings, and persistence helpers
(including annotation merging) in `sdk/repositories/`. Import repositories directly
from their repository modules. Apply this boundary to persistence code you add or
refactor.

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
<!-- sonar:end:codex-secrets-on-read -->
