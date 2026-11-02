import { createLogger, type Logger } from "./lib/logging-service.ts";
import { createReport, type CreateReportBoundaries, type CreateReportResult } from "./report.ts";

export interface WarmCacheJobResult {
  outputFileName: string;
  reportKey: string;
  counts: CreateReportResult["report"]["metadata"]["counts"];
}

interface RunWarmCacheJobOptions {
  logger?: Logger;
  /** The external systems the report talks to; see {@link CreateReportBoundaries}. */
  boundaries?: CreateReportBoundaries;
}

export async function runWarmCacheJob({
  logger = createLogger("warm-cache-job"),
  boundaries,
}: RunWarmCacheJobOptions = {}): Promise<WarmCacheJobResult> {
  const report = await createReport({
    boundaries,
    logger,
  });

  return {
    outputFileName: report.outputFileName,
    reportKey: report.reportKey,
    counts: report.report.metadata.counts,
  };
}
