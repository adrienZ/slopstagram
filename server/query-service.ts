import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { storyDateSchema } from "../sdk/lib/story-date-service.ts";
import { fetchReport } from "./report-query.ts";
import type { ReportQuery } from "./report-query.ts";
import { fetchUserTimeline } from "./user-timeline-query.ts";

const getReport = createServerFn({ method: "GET" })
  .validator(z.object({ date: storyDateSchema.optional(), story: z.string().optional() }))
  .handler(async ({ data }) => await fetchReport(data));

const getUserTimeline = createServerFn({ method: "GET" })
  .validator(z.string())
  .handler(async ({ data }) => await fetchUserTimeline(data));

/**
 * Where route loaders read their data. The router receives it through its context, so
 * production uses the server functions and tests pass the in-process implementation
 * instead of replacing a loader or the router.
 */
export interface Queries {
  getReport: (options: { data: ReportQuery }) => ReturnType<typeof fetchReport>;
  getUserTimeline: (options: { data: string }) => ReturnType<typeof fetchUserTimeline>;
}

export const queries: Queries = { getReport, getUserTimeline };
