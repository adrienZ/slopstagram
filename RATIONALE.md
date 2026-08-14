# Rationale

This project intentionally uses both Bun and Node.js (mostly for windows).

## Why Bun

The Nitro application uses [bunqueue](https://bunqueue.dev) in **server mode**.
The Nitro plugin starts a standalone bunqueue process, which exclusively owns
`./data/bunq.db`, while the queue and worker connect over TCP through
`bunqueue-client`.

Only the bunqueue server requires Bun because its SQLite engine uses Bun-specific
APIs such as `bun:sqlite`. Nitro and the TCP client can run on Node.js. Server mode
keeps SQLite persistence, retries, scheduled jobs, and backup support while
preventing multiple application processes from opening the database directly.

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
