# Rationale

This project intentionally uses both Bun and Node.js (mostly for windows).

## Why Bun

Bun is required because this project runs [bunqueue](https://bunqueue.dev) in
**embedded mode**. Bunqueue's embedded run inside the same process as the
Nitro application. engine uses Bun-specific APIs such as `bun:sqlite`, so it cannot run inside a Node.js process.

SQLite persistence is independent of embedded mode. Bunqueue can also run in
**server mode**, where a standalone bunqueue process owns the same persistent
SQLite database and a Node.js Nitro application connects to it over TCP using
`bunqueue-client`. Server mode keeps SQLite persistence, retries, scheduled jobs,
and backup support, but adds a separately supervised process. Therefore:

- One application process with embedded bunqueue requires Bun.
- Nitro running on Node.js requires bunqueue server mode.
- Both modes can persist their state in a SQLite file.

## Why `tsx` for Playwright

The `auth`, `fetch:stories`, and `create:report` entrypoints launch Playwright.
They run through [`tsx`](https://tsx.is), which executes TypeScript directly on
Node.js.

On Windows, launching Playwright's persistent Chromium context from Bun can leave
the browser on `about:blank` while `launchPersistentContext()` waits indefinitely
for Chromium's remote-debugging pipe. Running the same entrypoint through Node.js
works correctly. Using `tsx` keeps the commands cross-platform without requiring a
build step or spelling out Node loader flags.

<!-- Keep Playwright out of an in-process Bun worker on Windows. If a bunqueue worker
needs to create a report, it should invoke the `tsx`-backed report entrypoint (or
delegate to a separate Node.js process) instead of launching Playwright itself. -->
