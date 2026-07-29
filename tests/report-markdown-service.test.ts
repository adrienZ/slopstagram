import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatStoriesReportMarkdown } from "../scripts/lib/report-markdown-service.ts";
import type { StoriesManifestReport } from "../scripts/lib/types.ts";

function createReport(
  users: StoriesManifestReport["output"]["users"],
): StoriesManifestReport {
  return {
    failures: [],
    manifest: {
      users: [],
    },
    metadata: {
      broadcasts_count: 0,
      counts: {
        cache_hits: 0,
        cache_misses: 0,
        failed: 0,
        fetched: 0,
        reels: 0,
        stories: 0,
      },
      created_at: "2026-07-26T09:48:26.773Z",
      report_name: "stories-report.json",
      status: "ok",
      story_ranking_token: null,
    },
    output: {
      users,
    },
  };
}

describe("formatStoriesReportMarkdown", () => {
  test("formats a human-readable report with grouped story captions", () => {
    const markdown = formatStoriesReportMarkdown(
      createReport([
        {
          full_name: "Lucile Blandin",
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "Save the date",
              ig_caption:
                "Photo by Lucile Blandin on July 26, 2026. May be an image of wedding and text.",
              media_pk: "3949348915041739675",
              stickers: ["link:https://example.com", "mention:@lucileblnd"],
              status: "fetched",
            },
            {
              apple_caption: "Second apple caption",
              ig_caption: "Second caption",
              media_pk: "3949651783460086594",
              stickers: [],
              status: "cached",
            },
          ],
          username: "lucileblnd",
        },
      ]),
      {
        timeZone: "Europe/Paris",
      },
    );

    assert.equal(
      markdown,
      [
        "# Report July 26, 2026 at 11:48 CEST",
        "",
        "## Lucile Blandin (lucileblnd)",
        "",
        "| Story | stickers | ig_caption | apple_caption |",
        "| --- | --- | --- | --- |",
        "| `3949348915041739675` | link:https://example.com<br>mention:@lucileblnd | May be an image of wedding and text. | Save the date |",
        "| `3949651783460086594` |  | Second caption | Second apple caption |",
        "",
      ].join("\n"),
    );
  });

  test("uses existing caption fallback for blank captions and missing users", () => {
    const markdown = formatStoriesReportMarkdown(
      createReport([
        {
          full_name: null,
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "  ",
              ig_caption: "  ",
              media_pk: "story-pk-433",
              stickers: [],
              status: "failed",
            },
          ],
          username: null,
        },
        {
          full_name: null,
          reel_ids: ["r2"],
          stories: [
            {
              apple_caption: "Apple username caption",
              ig_caption: "Caption for username-only user",
              media_pk: "story-pk-123",
              stickers: ["hashtag:#summer"],
              status: "cached",
            },
          ],
          username: "username1",
        },
      ]),
      {
        timeZone: "Europe/Paris",
      },
    );

    assert.equal(
      markdown,
      [
        "# Report July 26, 2026 at 11:48 CEST",
        "",
        "## Unknown user",
        "",
        "| Story | stickers | ig_caption | apple_caption |",
        "| --- | --- | --- | --- |",
        "| `story-pk-433` |  | no caption avaible | no text detected |",
        "",
        "## username1",
        "",
        "| Story | stickers | ig_caption | apple_caption |",
        "| --- | --- | --- | --- |",
        "| `story-pk-123` | hashtag:#summer | Caption for username-only user | Apple username caption |",
        "",
      ].join("\n"),
    );
  });

  test("preserves hidden directional controls from captions", () => {
    const markdown = formatStoriesReportMarkdown(
      createReport([
        {
          full_name: "L u c i e ☀️",
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "‎รรชาพผนทงงามหม‎",
              ig_caption:
                "Photo by L u c i e ☀️ on July 25, 2026. May be an image of ‎text that says '‎รรชาพผนทงงามหม‎'‎.",
              media_pk: "3948996411573443635",
              stickers: [],
              status: "fetched",
            },
          ],
          username: "luciecsln",
        },
      ]),
      {
        timeZone: "Europe/Paris",
      },
    );

    assert.equal(
      markdown,
      [
        "# Report July 26, 2026 at 11:48 CEST",
        "",
        "## L u c i e ☀️ (luciecsln)",
        "",
        "| Story | stickers | ig_caption | apple_caption |",
        "| --- | --- | --- | --- |",
        "| `3948996411573443635` |  | May be an image of ‎text that says '‎รรชาพผนทงงามหม‎'‎. | ‎รรชาพผนทงงามหม‎ |",
        "",
      ].join("\n"),
    );
  });

  test("removes repeated author names while preserving caption locations", () => {
    const markdown = formatStoriesReportMarkdown(
      createReport([
        {
          full_name: "Tabata & Pepe",
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "Mountain deck chairs",
              ig_caption:
                "Photo by Tabata & Pepe in Ziano di Fiemme. May be an image of deck chair.",
              media_pk: "3949072268447669760",
              stickers: ["music:Alpine Song - DJ Peak"],
              status: "fetched",
            },
          ],
          username: "tabata.pepe",
        },
      ]),
      {
        timeZone: "Europe/Paris",
      },
    );

    assert.equal(
      markdown,
      [
        "# Report July 26, 2026 at 11:48 CEST",
        "",
        "## Tabata & Pepe (tabata.pepe)",
        "",
        "| Story | stickers | ig_caption | apple_caption |",
        "| --- | --- | --- | --- |",
        "| `3949072268447669760` | music:Alpine Song - DJ Peak | In Ziano di Fiemme. May be an image of deck chair. | Mountain deck chairs |",
        "",
      ].join("\n"),
    );
  });

  test("escapes markdown table delimiters in recap text", () => {
    const markdown = formatStoriesReportMarkdown(
      createReport([
        {
          full_name: "Pipe User",
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "apple | text",
              ig_caption: "one | two",
              media_pk: "story-pk-pipe",
              stickers: ["link:A | B"],
              status: "cached",
            },
          ],
          username: "pipeuser",
        },
      ]),
      {
        timeZone: "Europe/Paris",
      },
    );

    assert.equal(
      markdown,
      [
        "# Report July 26, 2026 at 11:48 CEST",
        "",
        "## Pipe User (pipeuser)",
        "",
        "| Story | stickers | ig_caption | apple_caption |",
        "| --- | --- | --- | --- |",
        "| `story-pk-pipe` | link:A \\| B | one \\| two | apple \\| text |",
        "",
      ].join("\n"),
    );
  });
});
