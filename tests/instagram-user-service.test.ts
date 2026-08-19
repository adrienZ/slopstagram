import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  hydrateReportInstagramUsers,
  persistReportInstagramUsers,
} from "../sdk/lib/instagram-user-service.ts";
import type { InstagramUserEntry, StoriesManifestReport } from "../sdk/lib/types.ts";

function createReportWithInstagramUser(): StoriesManifestReport {
  return {
    failures: [],
    manifest: {
      users: [
        {
          full_name: "Fixture User",
          id: "instagram-id-1",
          media_ids: [],
          order: 0,
          pk: "instagram-pk-1",
          profile_pic_url: "images/avatars/fixture.jpg",
          reel_id: "reel-1",
          stories: [],
          username: "fixture-user",
        },
      ],
    },
    metadata: {
      broadcasts_count: 0,
      counts: {
        cache_hits: 0,
        cache_misses: 0,
        failed: 0,
        fetched: 0,
        reels: 1,
        stories: 0,
      },
      created_at: "2026-08-14T12:00:00.000Z",
      report_name: "stories-report-fixture.json",
      status: "ok",
      story_ranking_token: null,
    },
    output: {
      users: [
        {
          full_name: "Fixture User",
          profile_pic_url: "images/avatars/fixture.jpg",
          reel_ids: ["reel-1"],
          stories: [],
          username: "fixture-user",
        },
      ],
    },
  };
}

function createRepository() {
  const entries = new Map<string, InstagramUserEntry>();
  return {
    entries,
    findByUsername: (username: string) => Promise.resolve(entries.get(username) ?? null),
    save: (value: InstagramUserEntry) => {
      entries.set(value.username, value);
      return Promise.resolve();
    },
  };
}

describe("Instagram user report persistence", () => {
  test("persists user data outside a report and hydrates it when read", async () => {
    const report = createReportWithInstagramUser();
    const repository = createRepository();

    await persistReportInstagramUsers(report, repository);

    assert.deepEqual(repository.entries.get("fixture-user"), {
      full_name: "Fixture User",
      id: "instagram-id-1",
      pk: "instagram-pk-1",
      username: "fixture-user",
    });
    assert.equal("full_name" in report.output.users[0], false);
    assert.equal("profile_pic_url" in report.output.users[0], false);
    assert.equal("full_name" in report.manifest.users[0], false);
    assert.equal("id" in report.manifest.users[0], false);
    assert.equal("pk" in report.manifest.users[0], false);
    assert.equal("profile_pic_url" in report.manifest.users[0], false);

    await hydrateReportInstagramUsers(report, repository);

    assert.equal(report.output.users[0]?.full_name, "Fixture User");
    assert.equal(report.output.users[0]?.profile_pic_url, "images/avatars/instagram-pk-1.jpg");
  });

  test("hydrates reports whose nullable user columns were read as null", async () => {
    const report = createReportWithInstagramUser();
    const repository = createRepository();

    await persistReportInstagramUsers(report, repository);
    report.manifest.users[0].full_name = null;
    report.manifest.users[0].profile_pic_url = null;
    report.output.users[0].full_name = null;
    report.output.users[0].profile_pic_url = null;

    await hydrateReportInstagramUsers(report, repository);

    assert.equal(report.output.users[0]?.full_name, "Fixture User");
    assert.equal(report.output.users[0]?.profile_pic_url, "images/avatars/instagram-pk-1.jpg");
  });
});
