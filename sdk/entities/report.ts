import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-orm/zod";

export const reports = sqliteTable("reports", {
  broadcastsCount: integer().notNull(),
  cacheHits: integer().notNull(),
  cacheMisses: integer().notNull(),
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
    mediaType: text(),
    previewImageUrl: text(),
    reelId: text().notNull(),
    reportKey: text()
      .notNull()
      .references(() => reports.key, { onDelete: "cascade" }),
    sortOrder: integer().notNull(),
    status: text().notNull(),
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
    reason: text().notNull(),
    reelId: text().notNull(),
    reportKey: text()
      .notNull()
      .references(() => reports.key, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.reportKey, table.failureIndex] })],
);
export const NewReportSchema = createInsertSchema(reports);
