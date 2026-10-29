import { expect, test } from "vitest";
import { JsonValueSchema, type JsonValue } from "../sdk/lib/json-value.ts";
import { createInstagramClient } from "../sdk/story-client-service.ts";
import { StoriesManifestReportSchema, StoryTrayEntrySchema } from "../sdk/lib/story-schemas.ts";
import galleryFixture from "./fixtures/instagram-story-data.json" with { type: "json" };
import reportFixture from "./fixtures/stories-report-server.json" with { type: "json" };
import trayFixture from "./fixtures/xdt_api__v1__feed__reels_tray.json" with { type: "json" };

// These tests fail when a recording stops matching the schemas production parses it with,
// so tests cannot keep passing on payload shapes Instagram no longer sends.

const lastPage = {
  data: {
    xdt_api__v1__feed__reels_media__connection: {
      edges: [],
      page_info: { has_next_page: false, end_cursor: null },
    },
  },
};

/** Serves the given response bodies in order, as consecutive pages. */
function sessionReturning(
  ...bodies: Array<JsonValue>
): Parameters<typeof createInstagramClient>[0] {
  return {
    page: {
      evaluate: async () =>
        await Promise.resolve({
          body: JSON.stringify(bodies.shift() ?? lastPage),
          headers: { "content-type": "application/json" },
          ok: true,
          status: 200,
        }),
    },
  };
}

test("the recorded story gallery page parses with the production client, which then fetches the next page", async () => {
  const response = await createInstagramClient(
    sessionReturning(JsonValueSchema.parse(galleryFixture)),
  ).getReelsMedia(["700000000000188", "700000000000193"]);

  const { reels_media: reels } = response.json();

  expect(reels.map(({ id }) => id)).toEqual(["700000000000188", "700000000000193"]);
  expect(reels.flatMap(({ items }) => items?.map(({ pk }) => pk))).toEqual([
    "700000000000271",
    "700000000000292",
    "700000000000314",
  ]);
});

test("the recorded reels tray parses with the production client", async () => {
  const response = await createInstagramClient(
    sessionReturning(JsonValueSchema.parse(trayFixture.xdt_api__v1__feed__reels_tray)),
  ).getTray();

  const { tray } = response.json();

  expect(tray).toHaveLength(trayFixture.xdt_api__v1__feed__reels_tray.tray.length);
  for (const entry of trayFixture.xdt_api__v1__feed__reels_tray.tray) {
    expect(StoryTrayEntrySchema.safeParse(entry).success).toBe(true);
  }
});

test("the recorded report parses with the production report schema", () => {
  expect(StoriesManifestReportSchema.safeParse(reportFixture).success).toBe(true);
});
