import process from "node:process";
import { pathToFileURL } from "node:url";
import { fetchStories } from "../sdk/index.ts";
import { createLogger } from "../sdk/lib/logging-service.ts";
import { recordFetchRun } from "../sdk/fetch-run.ts";
import { reportRepository } from "../sdk/repositories/report-repository.ts";
import { persistReportInstagramUsers } from "../sdk/lib/instagram-user-service.ts";

async function main(): Promise<void> {
  const logger = createLogger("fetch-stories");
  const payload = await recordFetchRun(async (run) => {
    const reportName = `stories-fetch-${run.startedAt.toISOString()}-${run.id}.json`;
    const report = await fetchStories(process.argv.slice(2), { logger, reportName });
    run.report = report;
    await reportRepository.save(reportName, report);
    run.reportKey = reportName;
    await persistReportInstagramUsers(globalThis.structuredClone(report));
    return report;
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
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
