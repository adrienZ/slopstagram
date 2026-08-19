// oxlint-disable eslint(max-lines) -- The report aggregate and persistence mapping belong together.
import { asc, eq } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-orm/zod";
import type { DrizzleDatabase } from "../database/client.ts";
import { createOutputUsers } from "../story-output-service.ts";
import { StoriesManifestReportSchema } from "../lib/story-schemas.ts";
import type { StoriesManifestReport, StoryManifestItem } from "../lib/types.ts";

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
export const reportReels = sqliteTable(
  "report_reels",
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
    igCaption: text().notNull(),
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
function toReportEntry(key: string, report: StoriesManifestReport): typeof reports.$inferInsert {
  const { counts } = report.metadata;

  return NewReportSchema.parse({
    broadcastsCount: report.metadata.broadcasts_count,
    cacheHits: counts.cache_hits,
    cacheMisses: counts.cache_misses,
    createdAt: report.metadata.created_at,
    failedCount: counts.failed,
    fetchedCount: counts.fetched,
    key,
    reelsCount: counts.reels,
    reportName: report.metadata.report_name,
    status: report.metadata.status,
    storiesCount: counts.stories,
    storyRankingToken: report.metadata.story_ranking_token,
  });
}
function toReportStoryEntry(
  reportKey: string,
  reelId: string,
  sortOrder: number,
  story: StoryManifestItem,
): typeof reportStories.$inferInsert {
  return {
    failureIndex: story.failure_index ?? null,
    igCaption: story.ig_caption,
    locations: JSON.stringify(story.locations),
    mediaPk: story.media_pk,
    mediaType: story.media_type ?? null,
    previewImageUrl: story.preview_image_url,
    reelId,
    reportKey,
    sortOrder,
    status: story.status,
    stickers: JSON.stringify(story.stickers),
  };
}
function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
function toManifestStory(row: typeof reportStories.$inferSelect): unknown {
  return {
    ...(row.failureIndex === null ? {} : { failure_index: row.failureIndex }),
    ig_caption: row.igCaption,
    locations: parseJson(row.locations),
    media_type: row.mediaType,
    media_pk: row.mediaPk,
    preview_image_url: row.previewImageUrl,
    status: row.status,
    stickers: parseJson(row.stickers),
  };
}
function toFailure(row: typeof reportFailures.$inferSelect): unknown {
  return {
    attempt_count: row.attemptCount,
    http_status: row.httpStatus,
    media_pk: row.mediaPk,
    message: row.message,
    reason: row.reason,
    reel_id: row.reelId,
  };
}
function buildManifestUsers(
  reels: Array<typeof reportReels.$inferSelect>,
  storyRows: Array<typeof reportStories.$inferSelect>,
): unknown[] {
  return reels.map((reel) => {
    const stories = storyRows
      .filter((story) => story.reelId === reel.reelId)
      .toSorted((left, right) => left.sortOrder - right.sortOrder);

    return {
      full_name: reel.fullName,
      id: reel.instagramId ?? undefined,
      media_ids: stories.map((story) => story.mediaPk),
      order: reel.sortOrder,
      pk: reel.instagramPk ?? undefined,
      profile_pic_url: reel.profilePicUrl,
      reel_id: reel.reelId,
      stories: stories.map((story) => toManifestStory(story)),
      username: reel.username,
    };
  });
}
function readReportRows(database: DrizzleDatabase, key: string) {
  return {
    failures: database
      .select()
      .from(reportFailures)
      .where(eq(reportFailures.reportKey, key))
      .orderBy(asc(reportFailures.failureIndex))
      .all()
      .map((row) => toFailure(row)),
    reels: database
      .select()
      .from(reportReels)
      .where(eq(reportReels.reportKey, key))
      .orderBy(asc(reportReels.sortOrder))
      .all(),
    stories: database.select().from(reportStories).where(eq(reportStories.reportKey, key)).all(),
  };
}
function toReport(
  report: typeof reports.$inferSelect,
  rows: ReturnType<typeof readReportRows>,
): StoriesManifestReport {
  const parsedReport = StoriesManifestReportSchema.parse({
    failures: rows.failures,
    manifest: { users: buildManifestUsers(rows.reels, rows.stories) },
    metadata: {
      broadcasts_count: report.broadcastsCount,
      counts: {
        cache_hits: report.cacheHits,
        cache_misses: report.cacheMisses,
        failed: report.failedCount,
        fetched: report.fetchedCount,
        reels: report.reelsCount,
        stories: report.storiesCount,
      },
      created_at: report.createdAt,
      report_name: report.reportName,
      status: report.status,
      story_ranking_token: report.storyRankingToken,
    },
    output: { users: [] },
  });

  return {
    ...parsedReport,
    output: { users: createOutputUsers(parsedReport.manifest.users) },
  };
}
async function upsertReport(
  database: DrizzleDatabase,
  entry: typeof reports.$inferInsert,
): Promise<void> {
  await database
    .insert(reports)
    .values(entry)
    .onConflictDoUpdate({
      set: {
        broadcastsCount: entry.broadcastsCount,
        cacheHits: entry.cacheHits,
        cacheMisses: entry.cacheMisses,
        createdAt: entry.createdAt,
        failedCount: entry.failedCount,
        fetchedCount: entry.fetchedCount,
        reelsCount: entry.reelsCount,
        reportName: entry.reportName,
        status: entry.status,
        storiesCount: entry.storiesCount,
        storyRankingToken: entry.storyRankingToken,
      },
      target: reports.key,
    });
}
async function replaceReportRelations(
  database: DrizzleDatabase,
  key: string,
  report: StoriesManifestReport,
): Promise<void> {
  await database.delete(reportFailures).where(eq(reportFailures.reportKey, key));
  await database.delete(reportStories).where(eq(reportStories.reportKey, key));
  await database.delete(reportReels).where(eq(reportReels.reportKey, key));

  for (const reel of report.manifest.users) {
    await database.insert(reportReels).values({
      fullName: reel.full_name ?? null,
      instagramId: reel.id ?? null,
      instagramPk: reel.pk ?? null,
      profilePicUrl: reel.profile_pic_url ?? null,
      reelId: reel.reel_id,
      reportKey: key,
      sortOrder: reel.order,
      username: reel.username,
    });
    for (const [sortOrder, story] of reel.stories.entries()) {
      await database
        .insert(reportStories)
        .values(toReportStoryEntry(key, reel.reel_id, sortOrder, story));
    }
  }

  for (const [failureIndex, failure] of report.failures.entries()) {
    await database.insert(reportFailures).values({
      attemptCount: failure.attempt_count,
      failureIndex,
      httpStatus: failure.http_status,
      mediaPk: failure.media_pk,
      message: failure.message,
      reason: failure.reason,
      reelId: failure.reel_id,
      reportKey: key,
    });
  }
}

export class ReportRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  findByKey(key: string): Promise<StoriesManifestReport | null> {
    const report = this.database.select().from(reports).where(eq(reports.key, key)).get();
    if (report === undefined) return Promise.resolve(null);
    return Promise.resolve(toReport(report, readReportRows(this.database, key)));
  }

  listKeys(): Promise<string[]> {
    const keys = this.database
      .select({ key: reports.key })
      .from(reports)
      .orderBy(reports.key)
      .all()
      .map((row) => row.key);

    return Promise.resolve(keys);
  }

  async save(key: string, value: StoriesManifestReport): Promise<void> {
    const report = StoriesManifestReportSchema.parse(value);
    await upsertReport(this.database, toReportEntry(key, report));
    await replaceReportRelations(this.database, key, report);
  }
}
