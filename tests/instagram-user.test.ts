import { describe, test, expect } from "vitest";
import { persistReportInstagramUsers } from "@@/core/domains/accounts/instagram-user.ts";
import type { StoriesManifestReport } from "@@/core/domains/fetch-run/report-types.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";

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

describe("Instagram user report persistence", () => {
  test("persists user data outside a report", async (context) => {
    const report = createReportWithInstagramUser();
    const runtime = await createTestRuntime(context);

    await persistReportInstagramUsers(runtime, report);

    expect(runtime.users.findByUsername("fixture-user")).toStrictEqual({
      full_name: "Fixture User",
      id: "instagram-id-1",
      pk: "instagram-pk-1",
      username: "fixture-user",
    });
    expect("full_name" in report.output.users[0]).toBe(false);
    expect("profile_pic_url" in report.output.users[0]).toBe(false);
    expect("full_name" in report.manifest.users[0]).toBe(false);
    expect("id" in report.manifest.users[0]).toBe(false);
    expect("pk" in report.manifest.users[0]).toBe(false);
    expect("profile_pic_url" in report.manifest.users[0]).toBe(false);
  });
});
