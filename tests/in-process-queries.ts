import { fetchReport } from "../server/report-query.ts";
import type { Queries } from "../server/query-service.ts";

/**
 * Runs the loaders' queries in the test process, at the given time, instead of through
 * the Start server functions, which only run inside the Start server. The loaders and
 * handlers behind them are the production ones.
 */
export function createInProcessQueries(now: Date): Queries {
  return { getReport: async ({ data }) => await fetchReport(data, now) };
}
