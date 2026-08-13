# Rationale

This project intentionally uses both Bun and Node.js (mostly for windows).

## Why Bun

Bun is required by [bunqueue](https://bunqueue.dev), which provides the embedded
job queue. As the embeded mode (sqlite) is only supported by Bun runtime.

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
