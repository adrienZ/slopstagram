import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { reports } from "./report.ts";

export const fetchRuns = sqliteTable("fetch_runs", {
  id: text().primaryKey(),
  startedAt: text().notNull(),
  finishedAt: text(),
  status: text({ enum: ["running", "succeeded", "partial", "failed"] }).notNull(),
  error: text(),
  reportKey: text().references(() => reports.key, { onDelete: "set null" }),
  storiesCount: integer(),
  reelsCount: integer(),
  fetchedCount: integer(),
  cacheHits: integer(),
  cacheMisses: integer(),
  failedCount: integer(),
});

export type FetchRun = typeof fetchRuns.$inferSelect;
