import process from "node:process";
import {
  openInstagramSession,
} from "./lib/playwright-service.ts";

async function main(): Promise<void> {
  await openInstagramSession({ headless: false });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
