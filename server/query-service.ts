import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";
import { storyDateSchema } from "../sdk/lib/story-date-service.ts";
import { fetchReport } from "./report-query.ts";
import type { ReportQuery } from "./report-query.ts";

const getReport = createServerFn({ method: "GET" })
  .validator(z.object({ date: storyDateSchema.optional(), story: z.string().optional() }))
  .handler(async ({ data }) => await fetchReport(data));

export const getUserTimeline = createServerFn({ method: "GET" })
  .validator(z.string())
  .handler(async ({ data }) => {
    const { loadUserTimeline } = await import("./user-timeline-handler.tsx");
    try {
      return loadUserTimeline(data);
    } catch (error) {
      if (error instanceof Error && "status" in error && error.status === 404) {
        notFound({ throw: true });
      }
      throw error;
    }
  });

/**
 * Where route loaders read their data. The router receives it through its context, so
 * production uses the server functions and tests pass the in-process implementation
 * instead of replacing a loader or the router.
 */
export interface Queries {
  getReport: (options: { data: ReportQuery }) => ReturnType<typeof fetchReport>;
}

export const queries: Queries = { getReport };
