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
              media_type: "image",
              media_pk: "story-pk-1",
              preview_image_url: "https://example.com/story.jpg",
              stickers: ["link:A & B"],
              status: "cached",
            },
            {
              apple_caption: " ",
              ig_caption: " ",
              media_type: "video",
              media_pk: "story-pk-2",
              preview_image_url: "https://example.com/story-2.jpg",
              stickers: [],
              status: "cached",
            },
          ],
          username: "htmluser",
        },
      ],
    },
  };
}

function getHeadingIndex(html: string, heading: string): number {
  const index = html.indexOf(`<h2>${heading}</h2>`);

  assert.notEqual(index, -1);

  return index;
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
        [
          "https://example.com/story-2.jpg",
          "../images/story-previews/story-2.jpg",
        ],
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
    assert.match(html, /\.user-summary\{[^}]*font-size:23px/);
    assert.match(html, /<div class="story-images">/);
    assert.match(html, /scroll-snap-type:x mandatory/);
    assert.doesNotMatch(html, /user-story-link/);
    assert.doesNotMatch(html, />Voir les stories<\/a>/);
    assert.match(
      html,
      /<img class="avatar" src="\.\.\/images\/avatars\/avatar\.jpg" alt="Html &quot;User&quot; \(htmluser\) avatar" width="96" height="96">/,
    );
    assert.match(
      html,
      /<button class="story-image-button" type="button" data-full-src="\.\.\/images\/story-previews\/story\.jpg" data-full-alt="aperçu story-pk-1" data-story-url="https:\/\/www\.instagram\.com\/stories\/htmluser\/story-pk-1\/" data-user-name="Html &quot;User&quot; \(htmluser\)" data-user-avatar="\.\.\/images\/avatars\/avatar\.jpg" data-user-image-index="1" data-user-image-count="2" data-story-media-type="Image" data-story-media-pk="story-pk-1" data-story-stickers="link:A &amp; B" data-story-ig-caption="Photo by Html User on July 26, 2026\. May be an image of text\." data-story-apple-caption="apple &lt;text&gt;" data-story-ollama-vision="vision \| text\nsecond line" aria-label="Ouvrir aperçu story-pk-1">/,
    );
    assert.match(html, /data-story-media-type="Vidéo"/);
    assert.doesNotMatch(html, /data-story-status/);
    assert.match(
      html,
      /<img class="story-preview" src="\.\.\/images\/story-previews\/story\.jpg" alt="aperçu story-pk-1">/,
    );
    assert.doesNotMatch(html, /class="story-media-type"/);
    assert.doesNotMatch(html, /class="story-link"/);
    assert.doesNotMatch(html, />Voir cette story<\/a>/);
    assert.match(
      html,
      /<dialog class="image-lightbox" id="image-lightbox" aria-label="Aperçu de l’image">/,
    );
    assert.match(
      html,
      /<dialog class="image-lightbox" id="image-lightbox" aria-label="Aperçu de l’image">[\s\S]*<img class="lightbox-image" alt="">[\s\S]*<aside class="lightbox-details-panel" aria-label="Détails de la story">[\s\S]*<\/dialog>/,
    );
    assert.doesNotMatch(html, /role="dialog"/);
    assert.match(html, /html\.lightbox-open,html\.lightbox-open body\{overflow:hidden\}/);
    assert.match(html, /\.image-lightbox:not\(\[open\]\)\{display:none\}/);
    assert.match(html, /\.image-lightbox::backdrop\{background:rgba\(8,12,18,\.82\)\}/);
    assert.match(html, /<div class="lightbox-content">/);
    assert.match(
      html,
      /\.lightbox-content\{[^}]*width:min\(100%,calc\(100vw - 56px\)\)[^}]*max-width:1600px/,
    );
    assert.match(
      html,
      /\.lightbox-preview-panel\{[^}]*flex:0 1 auto[^}]*max-width:calc\(100% - 320px\)/,
    );
    assert.match(html, /\.lightbox-details-panel\{[^}]*flex:1 1 360px/);
    assert.match(
      html,
      /\.lightbox-image\{[^}]*width:auto[^}]*height:auto[^}]*max-width:100%[^}]*max-height:calc\(100% - 62px\)/,
    );
    assert.match(html, /<div class="lightbox-preview-panel">/);
    assert.match(
      html,
      /<aside class="lightbox-details-panel" aria-label="Détails de la story">/,
    );
    assert.match(html, /<table class="lightbox-details-table">/);
    assert.match(
      html,
      /<tr><th scope="row">Type<\/th><td class="lightbox-detail-media-type"><\/td><\/tr>/,
    );
    assert.match(
      html,
      /<tr><th scope="row">Instagram<\/th><td class="lightbox-detail-ig-caption"><\/td><\/tr>/,
    );
    assert.doesNotMatch(html, /Statut/);
    assert.doesNotMatch(html, /lightbox-detail-status/);
    assert.match(html, /<details class="lightbox-vision-details">/);
    assert.match(html, /<summary>Résumé vision<\/summary>/);
    assert.match(
      html,
      /<\/details>\n<a class="lightbox-story-link" href="#" target="_blank" rel="noreferrer" hidden>Voir cette story sur Instagram<\/a>\n<\/aside>/,
    );
    assert.doesNotMatch(html, /<details class="lightbox-vision-details" open>/);
    assert.match(html, /@media \(max-width:760px\)/);
    assert.match(html, /<div class="lightbox-header" hidden>/);
    assert.match(html, /<img class="lightbox-avatar" alt="" hidden>/);
    assert.match(html, /<strong class="lightbox-username"><\/strong>/);
    assert.match(html, /<span class="lightbox-count"><\/span>/);
    assert.match(html, /<\/dialog>/);
    assert.match(html, /aria-label="Fermer l’aperçu"/);
    assert.match(html, /aria-label="Image précédente"/);
    assert.match(html, /aria-label="Image suivante"/);
    assert.match(html, /const storyImageButtons=Array\.from/);
    assert.match(html, /lightbox\.showModal\(\)/);
    assert.match(html, /document\.documentElement\.classList\.add\('lightbox-open'\)/);
    assert.match(html, /document\.documentElement\.classList\.remove\('lightbox-open'\)/);
    assert.match(html, /lightbox\?\.addEventListener\('close',clearLightboxState\)/);
    assert.match(html, /openLightboxAt\(lightboxIndex-1\)/);
    assert.match(html, /openLightboxAt\(lightboxIndex\+1\)/);
    assert.match(html, /ArrowLeft/);
    assert.match(html, /ArrowRight/);
    assert.match(html, /if\(event\.key==='Escape'\)return/);
    assert.match(html, /updateLightboxHeader\(button\)/);
    assert.match(html, /lightboxUsername\.textContent=button\.dataset\.userName/);
    assert.match(html, /button\.dataset\.userImageIndex/);
    assert.match(html, /button\.dataset\.userImageCount/);
    assert.match(html, /lightboxAvatar\.src=button\.dataset\.userAvatar/);
    assert.match(html, /lightboxStoryLink\.href=button\.dataset\.storyUrl/);
    assert.match(html, /Voir cette story sur Instagram/);
    assert.match(html, /lightboxImage\.src=button\.dataset\.fullSrc/);
    assert.match(html, /lightboxMediaType\.textContent=button\.dataset\.storyMediaType/);
    assert.match(html, /lightboxMediaPk\.textContent=button\.dataset\.storyMediaPk/);
    assert.doesNotMatch(html, /lightboxStatus/);
    assert.match(
      html,
      /lightboxVisionText\.textContent=button\.dataset\.storyOllamaVision/,
    );
    assert.match(html, /lightboxVisionDetails\.open=false/);
  });

  test("orders users by manifest rank in the html report", () => {
    const report = createReport();
    report.manifest.users = [
      {
        full_name: null,
        media_ids: ["story-pk-1"],
        order: 0,
        profile_pic_url: null,
        reel_id: "r1",
        stories: [],
        username: "ranked-first",
      },
      {
        full_name: null,
        media_ids: ["story-pk-2"],
        order: 1,
        profile_pic_url: null,
        reel_id: "r2",
        stories: [],
        username: "ranked-second",
      },
    ];
    report.output.users = [
      {
        full_name: "Ranked Second",
        profile_pic_url: null,
        reel_ids: ["r2"],
        stories: [],
        username: "ranked-second",
      },
      {
        full_name: "Ranked First",
        profile_pic_url: null,
        reel_ids: ["r1"],
        stories: [],
        username: "ranked-first",
      },
    ];

    const html = formatStoriesReportHtml(report);

    assert.ok(
      getHeadingIndex(html, "Ranked First (ranked-first)") <
        getHeadingIndex(html, "Ranked Second (ranked-second)"),
    );
  });
});
