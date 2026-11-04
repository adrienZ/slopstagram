# Rationale

## Why do we need Bun?

The Nitro application runs on Node.js, but the npm-installed `bunqueue` CLI
requires Bun. A Nitro plugin launches this CLI as a standalone bunqueue server.

The application connects to that server over TCP using `bunqueue-client`, which
supports Node.js.

## Why not use Bun everywhere?

The bunqueue server exclusively owns `./data/bunq.db`, while the Node.js queue
and worker communicate with it through `bunqueue-client`.

On Windows, launching Playwright's persistent Chromium context from Bun can leave
the browser on `about:blank` while `launchPersistentContext()` waits indefinitely
for Chromium's remote-debugging pipe. Running the same entrypoint through Node.js
works correctly. Using `tsx` keeps the commands cross-platform without requiring a
build step or spelling out Node loader flags.

you can find migration steps on this [commit](https://github.com/adrienZ/slopstagram/commit/b91a74e72028713b235150317f5509360f181715)

## Why don't we fetch Instagram user biographies?

Collecting biographies would add a separate authenticated profile request for each
account because the story tray does not reliably include them. We dropped [PR #10](https://github.com/adrienZ/slopstagram/pull/10) for that reason.

## Why does the chat use the Vercel AI SDK rather than TanStack AI?

The chat page is built from the official shadcn chat components, the successor of
[AI Elements](https://ui.shadcn.com/docs/ai-elements). They are designed around the
Vercel AI SDK message format and its `useChat` hook, so the AI SDK lets us render
streamed text, reasoning and tool parts without an adapter layer. The AI SDK also has an
Ollama provider, and Ollama stays the only model server.

TanStack AI would fit the TanStack Start app, and we prototyped both
([PR #270](https://github.com/adrienZ/slopstagram/pull/270) with the AI SDK,
[PR #271](https://github.com/adrienZ/slopstagram/pull/271) with TanStack AI). The choice is
cheap to revisit: TanStack AI documents a
[migration path from the Vercel AI SDK](https://tanstack.com/ai/latest/docs/migration/migration-from-vercel-ai),
and in business code only Assistant tool modules and the Assistant domain import the AI SDK,
plus the one chat hook on the client (ADR 0007).
