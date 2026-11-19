import type { WarmCacheJobResult } from "@@/core/domains/runtime/fetch-boundaries.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import { createReport } from "./report.ts";

export async function runWarmCacheJob(runtime: Runtime): Promise<WarmCacheJobResult> {
  const report = await createReport(runtime);

  return {
    outputFileName: report.outputFileName,
    reportKey: report.reportKey,
    counts: report.report.metadata.counts,
  };
}
