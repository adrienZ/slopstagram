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
