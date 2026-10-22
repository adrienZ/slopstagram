import { randomUUID } from "node:crypto";
import { fetchRunRepository } from "./repositories/fetch-run-repository.ts";
import type { StoriesManifestReport } from "./lib/types.ts";
import type { FetchRunRepository } from "./repositories/fetch-run-repository.ts";

interface FetchRunContext {
  id: string;
  startedAt: Date;
  report?: StoriesManifestReport;
  reportKey?: string;
}

interface FetchRunOptions {
  repository?: Pick<FetchRunRepository, "start" | "finish">;
  now?: () => Date;
}

export async function recordFetchRun<T>(
  perform: (run: FetchRunContext) => Promise<T>,
  options: FetchRunOptions = {},
): Promise<T> {
  const repository = options.repository ?? fetchRunRepository;
  const now = options.now ?? (() => new Date());
  const run: FetchRunContext = { id: randomUUID(), startedAt: now() };
  repository.start(run.id, run.startedAt.toISOString());
  try {
    const result = await perform(run);
    const counts = run.report?.metadata.counts;
    const totalFailure =
      counts !== undefined && counts.stories > 0 && counts.fetched + counts.cache_hits === 0;
    let status: "failed" | "partial" | "succeeded" = "succeeded";
    if (totalFailure) {
      status = "failed";
    } else if ((counts?.failed ?? 0) > 0) {
      status = "partial";
    }
    repository.finish(run.id, {
      finishedAt: now().toISOString(),
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
      finishedAt: now().toISOString(),
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      counts: run.report?.metadata.counts,
      reportKey: run.reportKey,
    });
    throw error;
  }
}
