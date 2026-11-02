import process from "node:process";
import { pathToFileURL } from "node:url";
import { createReport } from "@@/core/report.ts";
import { createLogger } from "@@/core/utils/logging.ts";

async function main(): Promise<void> {
  const logger = createLogger("create-report");
  await createReport({ logger });
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
