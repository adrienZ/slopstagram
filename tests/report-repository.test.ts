import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createDrizzle } from "@slopstagram/sdk/database/client.ts";
import { migrateDatabase } from "@slopstagram/sdk/database/migrate.ts";
import { ReportRepository } from "@slopstagram/sdk/repositories/report-repository.ts";
import { StoryRepository } from "@slopstagram/sdk/repositories/story-repository.ts";
import type { StoriesManifestReport } from "@slopstagram/sdk/lib/types.ts";

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
  test("reads the current story caption instead of a conflicting report caption", async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.after(() => {
      database.$client.close();
    });
    const repository = new ReportRepository(database);
    const stories = new StoryRepository(database);
    await stories.save({ pk: "shared-story", accessibility_caption: "Canonical caption" });
    const report = createReportWithStory("conflicting-caption");
    await repository.save("conflicting-caption", report);

    const stored = repository.findByKey("conflicting-caption");
    assert.equal(stored?.manifest.users[0]?.stories[0]?.ig_caption, "Canonical caption");
    assert.equal(stored.output.users[0]?.stories[0]?.ig_caption, "Canonical caption");

    await stories.save({ pk: "shared-story", accessibility_caption: "Updated caption" });
    assert.equal(
      repository.findByKey("conflicting-caption")?.output.users[0]?.stories[0]?.ig_caption,
      "Updated caption",
    );
    assert.equal(stories.findByMediaPk("shared-story")?.accessibility_caption, "Updated caption");
  });

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

    assert.deepEqual(repository.listKeys(), [
      older.metadata.report_name,
      newer.metadata.report_name,
    ]);
    assert.deepEqual(repository.findByKey(older.metadata.report_name), older);
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
    await new StoryRepository(database).save({
      pk: "shared-story",
      accessibility_caption: "Story caption",
    });

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
    assert.deepEqual(repository.findByKey(second.metadata.report_name), second);
    const [storedReport] = database.$client
      .prepare("SELECT createdAt, reportName, storiesCount FROM reports WHERE key = ?")
      .all(second.metadata.report_name)
      .map((row) => Object.fromEntries(Object.entries(row)));
    assert.deepEqual(storedReport, {
      createdAt: second.metadata.created_at,
      reportName: second.metadata.report_name,
      storiesCount: 1,
    });
  });

  for (const caption of [undefined, null, "", " \t\n "]) {
    test(`uses N/A for an absent story caption (${JSON.stringify(caption)}) without falling back to the report`, async (context) => {
      const database = createDrizzle(":memory:");
      migrateDatabase(database);
      context.after(() => {
        database.$client.close();
      });
      const repository = new ReportRepository(database);
      const stories = new StoryRepository(database);
      await stories.save({ pk: "shared-story", accessibility_caption: caption });
      const report = createReportWithStory("absent-caption");
      await repository.save("absent-caption", report);

      const stored = repository.findByKey("absent-caption");
      assert.equal(stored?.manifest.users[0]?.stories[0]?.ig_caption, "N/A");
      assert.deepEqual(stored.output.users[0]?.stories[0], {
        ...report.output.users[0].stories[0],
        ig_caption: "N/A",
      });
      assert.equal(
        stories.findByMediaPk("shared-story")?.accessibility_caption,
        caption ?? undefined,
      );
    });
  }

  test("keeps a failed report story when no associated story was saved", async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.after(() => {
      database.$client.close();
    });
    const repository = new ReportRepository(database);
    const report = createReportWithStory("missing-story");
    report.manifest.users[0].stories[0].status = "failed";
    report.manifest.users[0].stories[0].failure_index = 0;
    report.failures.push({
      attempt_count: 1,
      http_status: null,
      media_pk: "shared-story",
      message: "Story unavailable",
      reason: "missing_from_response",
      reel_id: "reel-1",
    });
    await repository.save("missing-story", report);

    const stored = repository.findByKey("missing-story");
    assert.deepEqual(stored?.manifest.users[0].stories[0], {
      ...report.manifest.users[0].stories[0],
      ig_caption: "N/A",
    });
    assert.deepEqual(stored.failures, report.failures);
    assert.equal(new StoryRepository(database).findByMediaPk("shared-story"), null);
  });
});
