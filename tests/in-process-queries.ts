import { fetchReport, fetchUserTimeline } from "../server/query-service.ts";
import type { Queries } from "../server/query-service.ts";

/** Calls the functions the server functions wrap, because server functions only run inside the Start server. */
export const inProcessQueries: Queries = {
  getReport: async ({ data }) => await fetchReport(data),
  getUserTimeline: async ({ data }) => await fetchUserTimeline(data),
};
