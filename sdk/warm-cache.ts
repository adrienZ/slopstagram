import { z } from "zod";
import { createLogger } from "./lib/logging-service.ts";
import type { Logger } from "./lib/logging-service.ts";
import { createReport, type CreateReportResult } from "./report.ts";

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

export function parseWarmCachePayload(payload: unknown): WarmCachePayload {
  return WarmCachePayloadSchema.parse(payload ?? {});
}

interface RunWarmCacheJobOptions {
  payload?: unknown;
  logger?: Logger;
  dependencies?: {
    createReport?: typeof createReport;
  };
}

export async function runWarmCacheJob({
  payload,
  logger = createLogger("warm-cache-job"),
  dependencies = {},
}: RunWarmCacheJobOptions = {}): Promise<WarmCacheJobResult> {
  const parsedPayload = parseWarmCachePayload(payload);
  const report = await (dependencies.createReport ?? createReport)({
    args: parsedPayload.reportArgs ?? parsedPayload.args ?? [],
    logger,
  });

  return {
    outputFileName: report.outputFileName,
    reportKey: report.reportKey,
    counts: report.report.metadata.counts,
  };
}
