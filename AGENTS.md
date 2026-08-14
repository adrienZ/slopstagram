## Bun

This project is using [Bun](https://bun.sh/docs) in order to use [bunqueue](https://bunqueue.dev).

You can discover the CLI tool using `bunx bunqueue --help`. The Nitro server plugin starts the standalone bunqueue server automatically.

Humans can explore the [dashboard](https://egeominotti.github.io/bunqueue-dashboard/docs/quickstart) running `bunx bunqueue-dashboard`

## Code changes

make sure to run `bun check` to validate your code changes.

## playwright

@playwright/cli is not globally installed. Always use the local package with the command separator: `bun exec --no-install -p @playwright/cli -- [command]`, always use headed mode.

To close existing instance of playwright browser, you can use the `kill-all` command.

instagram.com is an SPA application so make to wait loaded / idle state.
