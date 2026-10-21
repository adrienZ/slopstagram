import { query } from "@solidjs/router";

export const getReport = query(async (reportKey: string | null) => {
  "use server";
  const { loadReport } = await import("./report-handler.tsx");
  return loadReport(reportKey);
}, "report");

export const getUserTimeline = query(async (username: string) => {
  "use server";
  const { loadUserTimeline } = await import("./user-timeline-handler.tsx");
  return loadUserTimeline(username);
}, "user-timeline");
