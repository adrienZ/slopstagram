import { asc, eq, getTableColumns } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleDatabase } from "../database/client.ts";
import {
  NewReportSchema,
  ReportStorySchema,
  ReportFailureSchema,
  reports,
  reportStoryGroups,
  reportStories,
  reportFailures,
} from "../entities/report.ts";
import { stories } from "../entities/story.ts";
import { NO_ACCESSIBILITY_CAPTION } from "../lib/report-constants.ts";
import { StoriesManifestReportSchema } from "../lib/story-schemas.ts";
import { createOutputUsers } from "../story-output-service.ts";
import type {
  StoriesManifestReport,
  StoryFetchFailure,
  StoryManifestItem,
  StoryManifestReel,
} from "../report-types.ts";

type ReportStoryRow = typeof reportStories.$inferSelect & { accessibilityCaption: string | null };

function toReportEntry(key: string, report: StoriesManifestReport): typeof reports.$inferInsert {
  const { counts } = report.metadata;
  return NewReportSchema.parse({
    broadcastsCount: report.metadata.broadcasts_count,
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
function parseStringArray(value: string): Array<string> {
  return z.array(z.string()).parse(JSON.parse(value));
}
function toManifestStory(row: ReportStoryRow): StoryManifestItem {
  const story: StoryManifestItem = {
    ig_caption:
      row.accessibilityCaption !== null && row.accessibilityCaption.trim().length > 0
        ? row.accessibilityCaption
        : NO_ACCESSIBILITY_CAPTION,
    locations: parseStringArray(row.locations),
    media_type: ReportStorySchema.shape.mediaType.parse(row.mediaType),
    media_pk: row.mediaPk,
    preview_image_url: row.previewImageUrl,
    status: ReportStorySchema.shape.status.parse(row.status),
    stickers: parseStringArray(row.stickers),
  };
  if (row.failureIndex !== null) {
    story.failure_index = row.failureIndex;
  }
  return story;
}
function toFailure(row: typeof reportFailures.$inferSelect): StoryFetchFailure {
  return {
    attempt_count: row.attemptCount,
    http_status: row.httpStatus,
    media_pk: row.mediaPk,
    message: row.message,
    reason: ReportFailureSchema.shape.reason.parse(row.reason),
    reel_id: row.reelId,
  };
}
function buildManifestUsers(
  reels: Array<typeof reportStoryGroups.$inferSelect>,
  storyRows: Array<ReportStoryRow>,
): Array<StoryManifestReel> {
  return reels.map((reel) => {
    const reelStories = storyRows
      .filter((story) => story.reelId === reel.reelId)
      .toSorted((left, right) => left.sortOrder - right.sortOrder);

    return {
      full_name: reel.fullName,
      id: reel.instagramId ?? undefined,
      media_ids: reelStories.map((story) => story.mediaPk),
      order: reel.sortOrder,
      pk: reel.instagramPk ?? undefined,
      profile_pic_url: reel.profilePicUrl,
      reel_id: reel.reelId,
      stories: reelStories.map((story) => toManifestStory(story)),
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
      .from(reportStoryGroups)
      .where(eq(reportStoryGroups.reportKey, key))
      .orderBy(asc(reportStoryGroups.sortOrder))
      .all(),
    stories: database
      .select({
        ...getTableColumns(reportStories),
        accessibilityCaption: stories.accessibilityCaption,
      })
      .from(reportStories)
      .leftJoin(stories, eq(reportStories.mediaPk, stories.mediaPk))
      .where(eq(reportStories.reportKey, key))
      .all(),
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
  await database.delete(reportStoryGroups).where(eq(reportStoryGroups.reportKey, key));
  const reelEntries = report.manifest.users.map((reel) => ({
    fullName: reel.full_name ?? null,
    instagramId: reel.id ?? null,
    instagramPk: reel.pk ?? null,
    profilePicUrl: reel.profile_pic_url ?? null,
    reelId: reel.reel_id,
    reportKey: key,
    sortOrder: reel.order,
    username: reel.username,
  }));
  if (reelEntries.length > 0) {
    await database.insert(reportStoryGroups).values(reelEntries);
  }
  const storyEntries = report.manifest.users.flatMap((reel) =>
    reel.stories.map((story, sortOrder) => toReportStoryEntry(key, reel.reel_id, sortOrder, story)),
  );
  if (storyEntries.length > 0) {
    await database.insert(reportStories).values(storyEntries);
  }
  const failureEntries = report.failures.map((failure, failureIndex) => ({
    attemptCount: failure.attempt_count,
    failureIndex,
    httpStatus: failure.http_status,
    mediaPk: failure.media_pk,
    message: failure.message,
    reason: failure.reason,
    reelId: failure.reel_id,
    reportKey: key,
  }));
  if (failureEntries.length > 0) {
    await database.insert(reportFailures).values(failureEntries);
  }
}

export class ReportRepository {
  private readonly database: DrizzleDatabase;

  constructor(database: DrizzleDatabase) {
    this.database = database;
  }
  findByKey(key: string): StoriesManifestReport | null {
    const report = this.database.select().from(reports).where(eq(reports.key, key)).get();
    if (report === undefined) {
      return null;
    }
    return toReport(report, readReportRows(this.database, key));
  }
  listKeys(): Array<string> {
    const keys = this.database
      .select({ key: reports.key })
      .from(reports)
      .orderBy(reports.key)
      .all()
      .map((row) => row.key);

    return keys;
  }

  async save(key: string, value: StoriesManifestReport): Promise<void> {
    const report = StoriesManifestReportSchema.parse(value);
    await upsertReport(this.database, toReportEntry(key, report));
    await replaceReportRelations(this.database, key, report);
  }
}
