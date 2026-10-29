import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";
import { storyDateSchema } from "../sdk/lib/story-date-service.ts";

/** Turns the loaders' 404 errors into TanStack's not-found, so the router renders its not-found page. */
export function loadOrNotFound<Result>(load: () => Result): Result {
  try {
    return load();
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 404) {
      notFound({ throw: true });
    }
    throw error;
  }
}

export async function fetchReport(data: { date?: string; story?: string }) {
  const { loadReport } = await import("./report-handler.tsx");
  return loadOrNotFound(() => loadReport(new Date(), data.date, data.story));
}

export async function fetchUserTimeline(username: string) {
  const { loadUserTimeline } = await import("./user-timeline-handler.tsx");
  return loadOrNotFound(() => loadUserTimeline(username));
}

const getReport = createServerFn({ method: "GET" })
  .validator(z.object({ date: storyDateSchema.optional(), story: z.string().optional() }))
  .handler(async ({ data }) => await fetchReport(data));

const getUserTimeline = createServerFn({ method: "GET" })
  .validator(z.string())
  .handler(async ({ data }) => await fetchUserTimeline(data));

/** What route loaders read their data through, so tests can run them without the server function transport. */
export interface Queries {
  getReport: (options: {
    data: Parameters<typeof fetchReport>[0];
  }) => ReturnType<typeof fetchReport>;
  getUserTimeline: (options: {
    data: Parameters<typeof fetchUserTimeline>[0];
  }) => ReturnType<typeof fetchUserTimeline>;
}

export const queries: Queries = { getReport, getUserTimeline };
