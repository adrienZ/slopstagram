import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatStoriesReportHtml } from "../scripts/lib/report-html-service.ts";
import { getReportUserKey } from "../scripts/lib/report-user-key-service.ts";
import type { StoriesManifestReport } from "../scripts/lib/types.ts";

function createReport(): StoriesManifestReport {
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
        stories: 2,
      },
      created_at: "2026-07-26T09:48:26.773Z",
      report_name: "stories-report.json",
      status: "ok",
      story_ranking_token: null,
    },
    output: {
      users: [
        {
          full_name: 'Html "User"',
          profile_pic_url: "https://example.com/avatar.jpg",
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "apple <text>",
              ig_caption:
                "Photo by Html User on July 26, 2026. May be an image of text.",
              media_pk: "story-pk-1",
              preview_image_url: "https://example.com/story.jpg",
              stickers: ["link:A & B"],
              status: "cached",
            },
            {
              apple_caption: " ",
              ig_caption: " ",
              media_pk: "story-pk-2",
              preview_image_url: null,
              stickers: [],
              status: "failed",
            },
          ],
          username: "htmluser",
        },
      ],
    },
  };
}

describe("formatStoriesReportHtml", () => {
  test("formats the report with summaries and clickable preview images", () => {
    const report = createReport();
    const userKey = getReportUserKey(report.output.users[0]!, 0);
    const html = formatStoriesReportHtml(report, {
      ollamaVisionByPreviewUrl: new Map([
        ["https://example.com/story.jpg", "vision | text\nsecond line"],
      ]),
      profilePicPathByUrl: new Map([
        ["https://example.com/avatar.jpg", "../images/avatars/avatar.jpg"],
      ]),
      storyPreviewPathByUrl: new Map([
        ["https://example.com/story.jpg", "../images/story-previews/story.jpg"],
      ]),
      timeZone: "Europe/Paris",
      userSummaryByUserKey: new Map([
        [
          userKey,
          "Html User shared a text-focused story. It includes a visible preview and extracted details.",
        ],
      ]),
    });

    assert.match(html, /<html lang="fr">/);
    assert.match(html, /<h1>Rapport du 26 juillet 2026 à 11:48 UTC\+2<\/h1>/);
    assert.match(html, /<h2>Html &quot;User&quot; \(htmluser\)<\/h2>/);
    assert.match(
      html,
      /Html User shared a text-focused story\. It includes a visible preview and extracted details\./,
    );
    assert.match(html, /\.user-summary\{[^}]*font-size:21px/);
    assert.match(html, /<div class="story-images">/);
    assert.match(
      html,
      /<img class="avatar" src="\.\.\/images\/avatars\/avatar\.jpg" alt="Html &quot;User&quot; \(htmluser\) avatar" width="96" height="96">/,
    );
    assert.match(
      html,
      /<button class="story-image-button" type="button" data-full-src="\.\.\/images\/story-previews\/story\.jpg" data-full-alt="aperçu story-pk-1" aria-label="Ouvrir aperçu story-pk-1">/,
    );
    assert.match(
      html,
      /<img class="story-preview" src="\.\.\/images\/story-previews\/story\.jpg" alt="aperçu story-pk-1">/,
    );
    assert.match(
      html,
      /<div class="image-lightbox" id="image-lightbox" aria-modal="true" role="dialog" aria-label="Aperçu de l’image">/,
    );
    assert.match(html, /aria-label="Fermer l’aperçu"/);
    assert.match(html, /lightboxImage\.src=button\.dataset\.fullSrc/);
    assert.doesNotMatch(html, /<table>/);
    assert.doesNotMatch(html, /<th>ollama vision<\/th>/);
    assert.doesNotMatch(html, /apple &lt;text&gt;/);
  });
});
