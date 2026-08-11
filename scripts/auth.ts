import process from "node:process";
import { openInstagramSession } from "./lib/playwright-service.ts";

try {
  await openInstagramSession({ headless: false });
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
