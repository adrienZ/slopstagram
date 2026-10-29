import { z } from "zod";
import { createLogger, type Logger } from "./lib/logging-service.ts";
import { createReport, type CreateReportBoundaries, type CreateReportResult } from "./report.ts";

const WarmCachePayloadSchema = z.object({
  args: z.array(z.string()).optional(),
  reportArgs: z.array(z.string()).optional(),
});

export type WarmCachePayload = z.infer<typeof WarmCachePayloadSchema>;

export interface WarmCacheJobResult {
  outputFileName: string;
  reportKey: string;
  counts: CreateReportResult["report"]["metadata"]["counts"];
}

function parseWarmCachePayload(payload: WarmCachePayload | undefined): WarmCachePayload {
  return WarmCachePayloadSchema.parse(payload ?? {});
}

interface RunWarmCacheJobOptions {
  payload?: WarmCachePayload;
  logger?: Logger;
  /** The external systems the report talks to; see {@link CreateReportBoundaries}. */
  boundaries?: CreateReportBoundaries;
}

export async function runWarmCacheJob({
  payload,
  logger = createLogger("warm-cache-job"),
  boundaries,
}: RunWarmCacheJobOptions = {}): Promise<WarmCacheJobResult> {
  const parsedPayload = parseWarmCachePayload(payload);
  const report = await createReport({
    args: parsedPayload.reportArgs ?? parsedPayload.args ?? [],
    boundaries,
    logger,
  });

  return {
    outputFileName: report.outputFileName,
    reportKey: report.reportKey,
    counts: report.report.metadata.counts,
  };
}
