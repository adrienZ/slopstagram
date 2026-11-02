import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { STORY_MEDIA_TYPES } from "../story-types.ts";

export const reports = sqliteTable("reports", {
  broadcastsCount: integer().notNull(),
  createdAt: text().notNull(),
  failedCount: integer().notNull(),
  fetchedCount: integer().notNull(),
  key: text().primaryKey(),
  reelsCount: integer().notNull(),
  reportName: text().notNull(),
  status: text(),
  storiesCount: integer().notNull(),
  storyRankingToken: text(),
});
export const reportStoryGroups = sqliteTable(
  "report_story_groups",
  {
    fullName: text(),
    instagramId: text(),
    instagramPk: text(),
    profilePicUrl: text(),
    reelId: text().notNull(),
    reportKey: text()
      .notNull()
      .references(() => reports.key, { onDelete: "cascade" }),
    sortOrder: integer().notNull(),
    username: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.reportKey, table.reelId] })],
);
export const reportStories = sqliteTable(
  "report_stories",
  {
    failureIndex: integer(),
    locations: text().notNull(),
    mediaPk: text().notNull(),
    mediaType: text({ enum: [STORY_MEDIA_TYPES.IMAGE, STORY_MEDIA_TYPES.VIDEO] }),
    previewImageUrl: text(),
    reelId: text().notNull(),
    reportKey: text()
      .notNull()
      .references(() => reports.key, { onDelete: "cascade" }),
    sortOrder: integer().notNull(),
    status: text({ enum: ["ok", "failed"] }).notNull(),
    stickers: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.reportKey, table.reelId, table.mediaPk] })],
);
export const reportFailures = sqliteTable(
  "report_failures",
  {
    attemptCount: integer().notNull(),
    failureIndex: integer().notNull(),
    httpStatus: integer(),
    mediaPk: text(),
    message: text().notNull(),
    reason: text({ enum: ["request_failed", "rate_limited", "missing_from_response"] }).notNull(),
    reelId: text().notNull(),
    reportKey: text()
      .notNull()
      .references(() => reports.key, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.reportKey, table.failureIndex] })],
);
export const NewReportSchema = createInsertSchema(reports);
export const ReportSchema = createSelectSchema(reports);
export const ReportStoryGroupSchema = createSelectSchema(reportStoryGroups);
export const ReportStorySchema = createSelectSchema(reportStories);
export const ReportFailureSchema = createSelectSchema(reportFailures);
