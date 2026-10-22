import { desc, eq } from "drizzle-orm";
import { useDrizzle, type DrizzleDatabase } from "../database/client.ts";
import { fetchRuns, type FetchRun } from "../entities/fetch-run.ts";
import type { StoriesManifestReport } from "../lib/types.ts";

interface FinishedFetchRun {
  finishedAt: string;
  status: Exclude<FetchRun["status"], "running">;
  error?: string;
  reportKey?: string;
  counts?: StoriesManifestReport["metadata"]["counts"];
}

export class FetchRunRepository {
  private readonly database: DrizzleDatabase;

  constructor(database: DrizzleDatabase) {
    this.database = database;
  }

  start(id: string, startedAt: string): void {
    this.database.insert(fetchRuns).values({ id, startedAt, status: "running" }).run();
  }

  finish(id: string, result: FinishedFetchRun): void {
    this.database
      .update(fetchRuns)
      .set({
        finishedAt: result.finishedAt,
        status: result.status,
        error: result.error ?? null,
        reportKey: result.reportKey ?? null,
        storiesCount: result.counts?.stories ?? null,
        reelsCount: result.counts?.reels ?? null,
        fetchedCount: result.counts?.fetched ?? null,
        cacheHits: result.counts?.cache_hits ?? null,
        cacheMisses: result.counts?.cache_misses ?? null,
        failedCount: result.counts?.failed ?? null,
      })
      .where(eq(fetchRuns.id, id))
      .run();
  }

  list(): Array<FetchRun> {
    return this.database
      .select()
      .from(fetchRuns)
      .orderBy(desc(fetchRuns.startedAt), desc(fetchRuns.id))
      .all();
  }
}

export const fetchRunRepository = new FetchRunRepository(useDrizzle());
