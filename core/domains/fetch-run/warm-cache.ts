import type { WarmCacheJobResult } from "@@/core/domains/runtime/fetch-boundaries.ts";
import { createReport } from "./report.ts";

export async function runWarmCacheJob(
  runtime: Parameters<typeof createReport>[0],
): Promise<WarmCacheJobResult> {
  const report = await createReport(runtime);

  return {
    outputFileName: report.outputFileName,
    reportKey: report.reportKey,
    counts: report.report.metadata.counts,
  };
}
