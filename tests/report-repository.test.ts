import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { ReportRepository } from "../sdk/entities/report.ts";
import type { StoriesManifestReport } from "../sdk/lib/types.ts";

function createReport(name: string): StoriesManifestReport {
  return {
    failures: [],
    manifest: { users: [] },
    metadata: {
      broadcasts_count: 0,
      counts: { cache_hits: 0, cache_misses: 0, failed: 0, fetched: 0, reels: 0, stories: 0 },
      created_at: "2026-08-17T12:00:00.000Z",
      report_name: name,
      status: "ok",
      story_ranking_token: null,
    },
    output: { users: [] },
  };
}

function createReportWithStory(name: string): StoriesManifestReport {
  return {
    ...createReport(name),
    manifest: {
      users: [
        {
          full_name: "Report User",
          id: "instagram-id",
          media_ids: ["shared-story"],
          order: 0,
          pk: "instagram-pk",
          profile_pic_url: "images/avatars/instagram-pk.jpg",
          reel_id: "reel-1",
          stories: [
            {
              ig_caption: "Story caption",
              locations: ["Paris"],
              media_type: null,
              media_pk: "shared-story",
              preview_image_url: "images/story-previews/shared-story.jpg",
              stickers: ["location:Paris"],
              status: "ok",
            },
          ],
          username: "report-user",
        },
      ],
    },
    metadata: {
      ...createReport(name).metadata,
      counts: { cache_hits: 1, cache_misses: 0, failed: 0, fetched: 0, reels: 1, stories: 1 },
    },
    output: {
      users: [
        {
          full_name: "Report User",
          profile_pic_url: "images/avatars/instagram-pk.jpg",
          reel_ids: ["reel-1"],
          stories: [
            {
              ig_caption: "Story caption",
              locations: ["Paris"],
              media_type: null,
              media_pk: "shared-story",
              preview_image_url: "images/story-previews/shared-story.jpg",
              stickers: ["location:Paris"],
              status: "ok",
            },
          ],
          username: "report-user",
        },
      ],
    },
  };
}

describe("ReportRepository", () => {
  test("stores report snapshots and lists their keys in creation order", async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.after(() => {
      database.$client.close();
    });
    const repository = new ReportRepository(database);
    const older = createReport("stories-report-2026-08-16T12-00-00+0000.json");
    const newer = createReport("stories-report-2026-08-17T12-00-00+0000.json");

    await repository.save(older.metadata.report_name, older);
    await repository.save(newer.metadata.report_name, newer);

    assert.deepEqual(await repository.listKeys(), [
      older.metadata.report_name,
      newer.metadata.report_name,
    ]);
    assert.deepEqual(await repository.findByKey(older.metadata.report_name), older);
  });

  test("links a story to each report while keeping report metadata as columns", async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.after(() => {
      database.$client.close();
    });
    const repository = new ReportRepository(database);
    const first = createReportWithStory("stories-report-2026-08-16T12-00-00+0000.json");
    const second = createReportWithStory("stories-report-2026-08-17T12-00-00+0000.json");

    await repository.save(first.metadata.report_name, first);
    await repository.save(second.metadata.report_name, second);

    const reportStoryLinks = database.$client
      .prepare("SELECT reportKey, mediaPk FROM report_stories ORDER BY reportKey")
      .all()
      .map((row) => Object.fromEntries(Object.entries(row)));
    assert.deepEqual(reportStoryLinks, [
      { mediaPk: "shared-story", reportKey: first.metadata.report_name },
      { mediaPk: "shared-story", reportKey: second.metadata.report_name },
    ]);
    assert.deepEqual(await repository.findByKey(second.metadata.report_name), second);
    const storedReport = database.$client
      .prepare("SELECT createdAt, reportName, storiesCount FROM reports WHERE key = ?")
      .all(second.metadata.report_name)
      .map((row) => Object.fromEntries(Object.entries(row)))[0];
    assert.deepEqual(storedReport, {
      createdAt: second.metadata.created_at,
      reportName: second.metadata.report_name,
      storiesCount: 1,
    });
  });
});
