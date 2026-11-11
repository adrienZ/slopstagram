import { randomUUID } from "node:crypto";
import type { FetchRunRepository } from "@@/core/domains/database/repositories/fetch-run-repository.ts";
import type { StoriesManifestReport } from "./report-types.ts";

interface FetchRunContext {
  id: string;
  startedAt: Date;
  report?: StoriesManifestReport;
  reportKey?: string;
}

export async function recordFetchRun<T>(
  { fetchRuns: repository }: { fetchRuns: Pick<FetchRunRepository, "start" | "finish"> },
  perform: (run: FetchRunContext) => Promise<T>,
): Promise<T> {
  const run: FetchRunContext = { id: randomUUID(), startedAt: new Date() };
  repository.start(run.id, run.startedAt.toISOString());
  try {
    const result = await perform(run);
    const counts = run.report?.metadata.counts;
    const totalFailure = counts !== undefined && counts.stories > 0 && counts.fetched === 0;
    let status: "failed" | "partial" | "succeeded" = "succeeded";
    if (totalFailure) {
      status = "failed";
    } else if ((counts?.failed ?? 0) > 0) {
      status = "partial";
    }
    repository.finish(run.id, {
      finishedAt: new Date().toISOString(),
      status,
      error: totalFailure
        ? (run.report?.failures[0]?.message ?? "No story media could be fetched")
        : undefined,
      counts,
      reportKey: run.reportKey,
    });
    return result;
  } catch (error) {
    repository.finish(run.id, {
      finishedAt: new Date().toISOString(),
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      counts: run.report?.metadata.counts,
      reportKey: run.reportKey,
    });
    throw error;
  }
}
