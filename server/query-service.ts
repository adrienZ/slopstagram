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

export const getReport = createServerFn({ method: "GET" })
  .validator(z.object({ date: storyDateSchema.optional(), story: z.string().optional() }))
  .handler(async ({ data }) => {
    const { loadReport } = await import("./report-handler.tsx");
    return loadOrNotFound(() => loadReport(new Date(), data.date, data.story));
  });

export const getUserTimeline = createServerFn({ method: "GET" })
  .validator(z.string())
  .handler(async ({ data }) => {
    const { loadUserTimeline } = await import("./user-timeline-handler.tsx");
    return loadOrNotFound(() => loadUserTimeline(data));
  });
