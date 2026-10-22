# Split web and SDK workspaces while preserving report execution

Use two npm workspace packages: `apps/web` contains the TanStack application and
Nitro server; `packages/sdk` contains collection, enrichment, scripts, and shared
persistence. Keep command entry points and shared development tooling at the
repository root. This separates frontend dependency ownership from the SDK while
retaining a single domain context, root glossary, and shared ADR directory.

A workspace reorganization must preserve the existing runtime behavior: Nitro
starts the background queue infrastructure and worker that generate reports, and
reports can also be generated through scripts exposed by the root `package.json`.
The web application and report generation continue to run on the same machine
and use the same database and media cache.

Workspace boundaries organize code and dependency ownership; they do not require
an independently started collector application. Keeping the existing entry points
avoids adding another required process for the operator to manage. A separate
data package is unnecessary for this split because Nitro also needs the SDK to
run its background worker.

## Implementation constraints

- The web package depends on the SDK; the SDK must not depend on the web package.
- Keep table definitions and entity types in the SDK's `entities/` directory.
  Keep repositories, queries, transactions, row mappings, and persistence helpers
  in its `repositories/` directory. Import repositories directly from their
  repository modules.
- Resolve one explicit absolute data directory for the database and media cache
  across entry points. Changing the working directory to a workspace must not
  select a different database or cache.
- Keep one schema and migration history in the SDK. Run migrations at Nitro
  startup or explicitly through Drizzle Kit; scripts require an initialized
  database and must not trigger migrations.
- Preserve root commands for starting the web application and generating reports.
