import { createReport, type CreateReportResult } from "./report.ts";

export interface WarmCacheJobResult {
  outputFileName: string;
  reportKey: string;
  counts: CreateReportResult["report"]["metadata"]["counts"];
}

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
