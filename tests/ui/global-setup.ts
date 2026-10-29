import process from "node:process";
import type { TestProject } from "vitest/node";
import type { ReportPageProps } from "../../server/pages/report.tsx";
import type { TimelineContentProps } from "../../server/pages/users/$username.tsx";

declare module "vitest" {
  export interface ProvidedContext {
    reportProps: ReportPageProps;
    pastReportProps: ReportPageProps;
    emptyDayReportProps: ReportPageProps;
    timelineProps: TimelineContentProps;
  }
}

/**
 * jsdom tests cannot run the SQLite-backed loaders, so Node computes their page
 * props once: the real loaders over a database seeded by the production pipeline.
 */
export default async function setup(project: TestProject): Promise<void> {
  // SAFETY: tests/seed.ts and the loaders open the application database on import, so this must be set first.
  process.env.SLOPSTAGRAM_DATABASE_PATH = ":memory:";
  const { migrateDatabase } = await import("../../sdk/database/migrate.ts");
  const { pageNow, seedPageData } = await import("../seed.ts");
  const { loadReport } = await import("../../server/report-handler.tsx");
  const { loadUserTimeline } = await import("../../server/user-timeline-handler.tsx");

  migrateDatabase();
  await seedPageData();
  project.provide("reportProps", loadReport(pageNow));
  project.provide("pastReportProps", loadReport(pageNow, "2026-07-25"));
  project.provide("emptyDayReportProps", loadReport(pageNow, "2026-07-24"));
  project.provide("timelineProps", loadUserTimeline("user_019", pageNow));
}
