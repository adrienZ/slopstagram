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
          profile_pic_url: "https://example.com/avatar.jpg",
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "Save the date",
              ig_caption:
                "Photo by Lucile Blandin on July 26, 2026. May be an image of wedding and text.",
              media_pk: "3949348915041739675",
              preview_image_url: "https://example.com/story-preview.jpg",
              stickers: ["link:https://example.com", "mention:@lucileblnd"],
              status: "fetched",
            },
            {
              apple_caption: "Second apple caption",
              ig_caption: "Second caption",
              media_pk: "3949651783460086594",
              preview_image_url: null,
              stickers: [],
              status: "cached",
            },
          ],
          username: "lucileblnd",
        },
      ]),
      {
        ollamaVisionByPreviewUrl: new Map([
          ["https://example.com/story-preview.jpg", "vision | text\nsecond line"],
        ]),
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
        '<img src="https://example.com/avatar.jpg" alt="Lucile Blandin (lucileblnd) avatar" width="96" height="96">',
        "",
        "| Preview | Story | stickers | ig_caption | apple_caption | ollama vision |",
        "| --- | --- | --- | --- | --- | --- |",
        '| <img src="https://example.com/story-preview.jpg" alt="3949348915041739675 preview" width="120"> | `3949348915041739675` | link:https://example.com<br>mention:@lucileblnd | May be an image of wedding and text. | Save the date | vision \\| text<br>second line |',
        "|  | `3949651783460086594` |  | Second caption | Second apple caption |  |",
        "",
      ].join("\n"),
    );
  });

  test("uses existing caption fallback for blank captions and missing users", () => {
    const markdown = formatStoriesReportMarkdown(
      createReport([
        {
          full_name: null,
          profile_pic_url: null,
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "  ",
              ig_caption: "  ",
              media_pk: "story-pk-433",
              preview_image_url: null,
              stickers: [],
              status: "failed",
            },
          ],
          username: null,
        },
        {
          full_name: null,
          profile_pic_url: null,
          reel_ids: ["r2"],
          stories: [
            {
              apple_caption: "Apple username caption",
              ig_caption: "Caption for username-only user",
              media_pk: "story-pk-123",
              preview_image_url: null,
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
        "| Preview | Story | stickers | ig_caption | apple_caption | ollama vision |",
        "| --- | --- | --- | --- | --- | --- |",
        "|  | `story-pk-433` |  | no caption avaible | no text detected |  |",
        "",
        "## username1",
        "",
        "| Preview | Story | stickers | ig_caption | apple_caption | ollama vision |",
        "| --- | --- | --- | --- | --- | --- |",
        "|  | `story-pk-123` | hashtag:#summer | Caption for username-only user | Apple username caption |  |",
        "",
      ].join("\n"),
    );
  });

  test("preserves hidden directional controls from captions", () => {
    const markdown = formatStoriesReportMarkdown(
      createReport([
        {
          full_name: "L u c i e ☀️",
          profile_pic_url: null,
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "‎รรชาพผนทงงามหม‎",
              ig_caption:
                "Photo by L u c i e ☀️ on July 25, 2026. May be an image of ‎text that says '‎รรชาพผนทงงามหม‎'‎.",
              media_pk: "3948996411573443635",
              preview_image_url: null,
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
        "| Preview | Story | stickers | ig_caption | apple_caption | ollama vision |",
        "| --- | --- | --- | --- | --- | --- |",
        "|  | `3948996411573443635` |  | May be an image of ‎text that says '‎รรชาพผนทงงามหม‎'‎. | ‎รรชาพผนทงงามหม‎ |  |",
        "",
      ].join("\n"),
    );
  });

  test("removes repeated author names while preserving caption locations", () => {
    const markdown = formatStoriesReportMarkdown(
      createReport([
        {
          full_name: "Tabata & Pepe",
          profile_pic_url: null,
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "Mountain deck chairs",
              ig_caption:
                "Photo by Tabata & Pepe in Ziano di Fiemme. May be an image of deck chair.",
              media_pk: "3949072268447669760",
              preview_image_url: null,
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
        "| Preview | Story | stickers | ig_caption | apple_caption | ollama vision |",
        "| --- | --- | --- | --- | --- | --- |",
        "|  | `3949072268447669760` | music:Alpine Song - DJ Peak | In Ziano di Fiemme. May be an image of deck chair. | Mountain deck chairs |  |",
        "",
      ].join("\n"),
    );
  });

  test("escapes markdown table delimiters in recap text", () => {
    const markdown = formatStoriesReportMarkdown(
      createReport([
        {
          full_name: "Pipe User",
          profile_pic_url: null,
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "apple | text",
              ig_caption: "one | two",
              media_pk: "story-pk-pipe",
              preview_image_url: null,
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
        "| Preview | Story | stickers | ig_caption | apple_caption | ollama vision |",
        "| --- | --- | --- | --- | --- | --- |",
        "|  | `story-pk-pipe` | link:A \\| B | one \\| two | apple \\| text |  |",
        "",
      ].join("\n"),
    );
  });

  test("escapes avatar html attributes", () => {
    const markdown = formatStoriesReportMarkdown(
      createReport([
        {
          full_name: 'Avatar "User"',
          profile_pic_url: 'https://example.com/avatar.jpg?x=1&label="me"',
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "apple text",
              ig_caption: "ig text",
              media_pk: "story-pk-avatar",
              preview_image_url: null,
              stickers: [],
              status: "cached",
            },
          ],
          username: "avataruser",
        },
      ]),
      {
        timeZone: "Europe/Paris",
      },
    );

    assert.match(
      markdown,
      /<img src="https:\/\/example\.com\/avatar\.jpg\?x=1&amp;label=&quot;me&quot;" alt="Avatar &quot;User&quot; \(avataruser\) avatar" width="96" height="96">/,
    );
  });

  test("uses cached avatar paths when provided", () => {
    const source = "https://example.com/avatar.jpg";
    const markdown = formatStoriesReportMarkdown(
      createReport([
        {
          full_name: "Cached Avatar",
          profile_pic_url: source,
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "apple text",
              ig_caption: "ig text",
              media_pk: "story-pk-avatar",
              preview_image_url: "https://example.com/story-preview.jpg",
              stickers: [],
              status: "cached",
            },
          ],
          username: "cachedavatar",
        },
      ]),
      {
        profilePicPathByUrl: new Map([[source, "../images/avatars/avatar.jpg"]]),
        storyPreviewPathByUrl: new Map([
          ["https://example.com/story-preview.jpg", "../images/story-previews/story.jpg"],
        ]),
        timeZone: "Europe/Paris",
      },
    );

    assert.match(
      markdown,
      /<img src="\.\.\/images\/avatars\/avatar\.jpg" alt="Cached Avatar \(cachedavatar\) avatar" width="96" height="96">/,
    );
    assert.match(
      markdown,
      /<img src="\.\.\/images\/story-previews\/story\.jpg" alt="story-pk-avatar preview" width="120">/,
    );
  });
});
