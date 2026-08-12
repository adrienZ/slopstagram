import process from "node:process";
import { pathToFileURL } from "node:url";
import { createReport } from "../sdk/index.ts";
import { createLogger } from "../sdk/lib/logging-service.ts";

async function main(): Promise<void> {
  const logger = createLogger("create-report");
  await createReport({
    args: process.argv.slice(2),
    logger,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
