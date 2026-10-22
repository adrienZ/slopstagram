import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";

export const getReport = createServerFn({ method: "GET" })
  .validator(z.string().nullable())
  .handler(async ({ data }) => {
    const { loadReport } = await import("./report-handler.tsx");
    try {
      return loadReport(data);
    } catch (error) {
      if (error instanceof Error && "status" in error && error.status === 404) {
        notFound({ throw: true });
      }
      throw error;
    }
  });

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
