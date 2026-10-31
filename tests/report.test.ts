import { assert, test, type TestContext, expect } from "vitest";
import { createConsola } from "consola";
import { createReport } from "../sdk/report.ts";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { FetchRunRepository } from "../sdk/repositories/fetch-run-repository.ts";
import { ReportRepository } from "../sdk/repositories/report-repository.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { persistReportInstagramUsers } from "../sdk/lib/instagram-user-service.ts";
import type { Logger } from "../sdk/lib/logging-service.ts";
import type { StoriesManifestReport } from "../sdk/report-types.ts";
import { createStoryFeed } from "../sdk/story-feed.ts";
import { cacheReportAudio } from "../sdk/report-audio-service.ts";
import { startMediaServer, wavAudio } from "./media-server.ts";

function log(): void {}
log.raw = log;
function createMockLogger(): Logger {
  const logger = createConsola();
  logger.mockTypes(() => log);
  return Object.assign(logger, { progress: () => {} });
}

function createFixture(context: TestContext) {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  const runs = new FetchRunRepository(database);
  const reports = new ReportRepository(database);
  const stories = new StoryRepository(database);
  const users = new InstagramUserRepository(database);
  const report: StoriesManifestReport = {
    failures: [],
    manifest: { users: [] },
    output: { users: [] },
    metadata: {
      broadcasts_count: 0,
      counts: { failed: 0, fetched: 1, reels: 1, stories: 1 },
      created_at: "2026-10-22T10:00:00.000Z",
      report_name: "placeholder.json",
      status: "ok",
      story_ranking_token: null,
    },
  };
  const dependencies = {
    cacheReportAudio: async (value: StoriesManifestReport) => {
      await cacheReportAudio(value, { database });
    },
    fetchRunRepository: runs,
    fetchStories: async () => report,
    saveReport: reports.save.bind(reports),
    persistReportInstagramUsers: async (value: StoriesManifestReport) => {
      await persistReportInstagramUsers(value, users);
    },
    cacheReportImages: async () => ({
      profilePicPathByUrl: new Map<string, string>(),
      storyPreviewPathByUrl: new Map<string, string>(),
    }),
    resolveAppleCaptionsForReport: async () => {},
    resolveVisionForReport: async () => new Map(),
    resolveUserSummariesForReport: async () => new Map(),
    createStoryFeed: (now: Date) => createStoryFeed(now, { repository: stories }),
    readStoryFeedVision: () => new Map(),
  };
  const options = {
    dependencies,
    logger: createMockLogger(),
    now: () => new Date("2026-10-22T10:00:00Z"),
  };
  return { database, runs, reports, stories, users, report, options };
}

test("records a failed fetch attempt even when Instagram returns no tray", async (context) => {
  const { runs, options } = createFixture(context);
  let time = new Date("2026-10-22T10:00:00Z");
  await expect(
    createReport({
      ...options,
      now: () => time,
      dependencies: {
        ...options.dependencies,
        fetchStories: async () => {
          expect(runs.list()[0].status).toBe("running");
          expect(runs.list()[0].startedAt).toBe("2026-10-22T10:00:00.000Z");
          time = new Date("2026-10-22T10:00:03Z");
          throw new Error("Instagram unavailable");
        },
      },
    }),
  ).rejects.toThrow(/Instagram unavailable/u);
  const [run] = runs.list();
  expect(run.status).toBe("failed");
  expect(run.finishedAt).toBe("2026-10-22T10:00:03.000Z");
  expect(run.error).toBe("Instagram unavailable");
  expect(run.storiesCount).toBe(null);
  expect(run.reportKey).toBe(null);
});

test("preserves a totally failed observation and its errors before rejecting the fetch", async (context) => {
  const { runs, reports, report, options } = createFixture(context);
  Object.assign(report.metadata.counts, { fetched: 0, failed: 1 });
  report.failures.push({
    attempt_count: 3,
    http_status: 500,
    media_pk: "123",
    message: "Instagram HTTP 500",
    reason: "request_failed",
    reel_id: "456",
  });
  await expect(createReport(options)).rejects.toThrow(/No story media could be fetched.*HTTP 500/u);
  const [run] = runs.list();
  expect(run.status).toBe("failed");
  expect(run.failedCount).toBe(1);
  expect(run.storiesCount).toBe(1);
  assert.ok(run.reportKey !== null);
  expect(reports.findByKey(run.reportKey)?.failures).toStrictEqual(report.failures);
});

for (const scenario of [
  { name: "empty tray", stories: 0, fetched: 0, failed: 0, status: "succeeded" },
  { name: "partial failure", stories: 2, fetched: 1, failed: 1, status: "partial" },
]) {
  test(`stores the run and observation for ${scenario.name}`, async (context) => {
    const { runs, reports, report, options } = createFixture(context);
    Object.assign(report.metadata.counts, {
      stories: scenario.stories,
      fetched: scenario.fetched,
      failed: scenario.failed,
    });
    const result = await createReport(options);
    const [run] = runs.list();
    expect(run.status).toBe(scenario.status);
    expect(run.reportKey).toBe(result.reportKey);
    expect(run.storiesCount).toBe(scenario.stories);
    expect(run.fetchedCount).toBe(scenario.fetched);
    expect(run.failedCount).toBe(scenario.failed);
    expect(run.error).toBe(null);
    expect(reports.findByKey(result.reportKey)).toBeTruthy();
  });
}

test("keeps the observation and marks the run failed when enrichment fails", async (context) => {
  const { runs, reports, options } = createFixture(context);
  await expect(
    createReport({
      ...options,
      dependencies: {
        ...options.dependencies,
        cacheReportImages: async () => {
          throw new Error("Image cache unavailable");
        },
      },
    }),
  ).rejects.toThrow(/Image cache unavailable/u);
  const [run] = runs.list();
  expect(run.status).toBe("failed");
  expect(run.error).toBe("Image cache unavailable");
  expect(run.fetchedCount).toBe(1);
  assert.ok(run.reportKey !== null);
  expect(reports.findByKey(run.reportKey)).toBeTruthy();
});

test("separate attempts at the same instant preserve separate runs and observations", async (context) => {
  const { runs, reports, options } = createFixture(context);
  const first = await createReport(options);
  const second = await createReport(options);
  expect(first.reportKey).not.toBe(second.reportKey);
  expect(runs.list().length).toBe(2);
  expect(reports.listKeys().length).toBe(2);
});

test("the shared report path persists and caches received audio before image enrichment", async (context) => {
  const { database, options, report, reports, stories } = createFixture(context);
  const { mkdtemp, rm, readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { default: path } = await import("node:path");
  const directory = await mkdtemp(path.join(tmpdir(), "report-audio-"));
  context.onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  const audio = wavAudio();
  const media = await startMediaServer(context, (_request, response) => {
    response.writeHead(200, { "content-type": "audio/wav" });
    response.end(audio);
  });
  await stories.save({
    pk: "audio-story",
    story_music_stickers: [
      {
        id: "sticker",
        music_asset_info: {
          audio_asset_id: "asset",
          title: "Song",
          display_artist: "Artist",
          progressive_download_url: "https://example.com/song.wav",
        },
      },
    ],
  });
  report.output.users.push({
    username: "one",
    reel_ids: [],
    stories: [
      {
        media_pk: "audio-story",
        status: "ok",
        ig_caption: "",
        locations: [],
        stickers: ["Song - Artist"],
        preview_image_url: null,
      },
    ],
  });
  await createReport({
    ...options,
    dependencies: {
      ...options.dependencies,
      cacheReportAudio: async (received) => {
        await cacheReportAudio(received, { database, directory, fetchMedia: media.fetchMedia });
      },
      cacheReportImages: async () => {
        expect(reports.listKeys().length).toBe(1);
        const metadata =
          stories.findByMediaPk("audio-story")?.annotations?.musicObservations?.[0].metadata;
        expect(metadata?.audioState).toBe("available");
        assert.ok(metadata);
        expect(metadata.audioDurationMs).toBe(1000);
        assert.ok(metadata.audioCachePath !== null);
        expect(await readFile(path.join(directory, metadata.audioCachePath))).toStrictEqual(audio);
        return { profilePicPathByUrl: new Map(), storyPreviewPathByUrl: new Map() };
      },
    },
  });
  expect(media.requests).toStrictEqual(["/song.wav"]);
});
