import process from "node:process";
import { pathToFileURL } from "node:url";
import { createReport } from "@@/core/fetch-run/report.ts";
import { getProductionRuntime } from "@@/core/runtime/production-runtime.ts";

async function main(): Promise<void> {
  await createReport(getProductionRuntime());
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
