import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, beforeEach, test, vi } from "vitest";
import { StoriesManifestReportSchema } from "../sdk/lib/story-schemas.ts";
import reportJson from "./fixtures/stories-report-server.json" with { type: "json" };
import { useDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import {
  appleVisionRepository,
  instagramUserRepository,
  reportRepository,
  storyRepository,
} from "../sdk/lib/entity-repository-service.ts";
import { getReport, getUserTimeline } from "../server/query-service.ts";
import { withRequest } from "./render-page.ts";

// oxlint-disable-next-line anti-slop/no-module-mocking -- Isolate the database location while exercising the real queries and repositories.
vi.mock("../sdk/lib/app-data-paths.ts", () => ({ APP_DATABASE_PATH: ":memory:" }));

const database = useDrizzle();
beforeAll(() => {
  migrateDatabase(database);
});
beforeEach(() => {
  database.$client.exec("SAVEPOINT query_test");
});
afterEach(() => {
  database.$client.exec("ROLLBACK TO query_test; RELEASE query_test");
});
afterAll(() => {
  database.$client.close();
});

test("report query rejects an empty library", async () => {
  await assert.rejects(
    withRequest("/report", async () => await getReport(null)),
    /no stories reports found/u,
  );
});

test("report query defaults to the latest report and can select an earlier report", async () => {
  const older = StoriesManifestReportSchema.parse(reportJson);
  const latest = StoriesManifestReportSchema.parse(reportJson);
  older.metadata.report_name = "stories-report-2026-07-26.json";
  latest.metadata.report_name = "stories-report-2026-07-27.json";
  latest.metadata.created_at = "2026-07-27T09:48:26.773Z";
  await reportRepository.save(older.metadata.report_name, older);
  await reportRepository.save(latest.metadata.report_name, latest);

  const current = await withRequest("/report", async () => await getReport(null));
  assert.equal(current.selectedReportKey, latest.metadata.report_name);
  assert.deepEqual(current.reportKeys, [older.metadata.report_name, latest.metadata.report_name]);
  assert.match(current.date, /27 juillet 2026/u);
  assert.equal(current.users[0].user.username, "ranked-first");
  assert.equal(current.users[1].stories[0].mediaPk, "story-pk-1");
  assert.equal(current.users[1].stories[0].preview, "/media/story-previews/story-pk-1.jpg");

  const previous = await withRequest(
    "/report",
    async () => await getReport(older.metadata.report_name),
  );
  assert.equal(previous.selectedReportKey, older.metadata.report_name);
  assert.match(previous.date, /26 juillet 2026/u);
});

test("report query rejects an unknown report", async () => {
  await assert.rejects(
    withRequest("/report", async () => await getReport("missing.json")),
    /could not be read/u,
  );
});

test("timeline query returns published stories in reverse chronological order", async () => {
  const owner = { full_name: "Timeline User", pk: "timeline-pk", username: "timeline-user" };
  await instagramUserRepository.save({ ...owner, id: "timeline-id" });
  await storyRepository.save({ pk: "older-story", media_type: 1, taken_at: 1_767_225_600 }, owner);
  await storyRepository.save({ pk: "newer-story", media_type: 2, taken_at: 1_767_312_000 }, owner);
  await appleVisionRepository.save("newer-story", "A readable caption");

  const result = await withRequest(
    "/users/timeline-user",
    async () => await getUserTimeline(owner.username),
  );
  assert.equal(result.timeline.timelineUser.username, owner.username);
  assert.equal(result.timeline.avatarPath, "/media/avatars/timeline-pk.jpg");
  assert.deepEqual(
    result.stories.map((story) => story.mediaPk),
    ["newer-story", "older-story"],
  );
  assert.equal(result.stories[0].appleCaption, "A readable caption");
  assert.equal(result.stories[0].mediaType, "Vidéo");
  assert.equal(result.timeline.years[0].months[0].days[0].key, "2026-01-02");
});

test("timeline query rejects a user without published stories", async () => {
  await assert.rejects(
    withRequest("/users/missing-user", async () => await getUserTimeline("missing-user")),
    /no published stories/u,
  );
});
