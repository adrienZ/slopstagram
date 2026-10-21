import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { H3 } from "nitro/h3";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { StoriesManifestReportSchema } from "../sdk/lib/story-schemas.ts";
import { ReportPage } from "../server/pages/report-page.tsx";
import type { ReportContentProps } from "../server/pages/report-page.tsx";
import { getRankedUsers } from "../server/helper.ts";
import { createStoryCards } from "../server/story-card-view-model.ts";

const reportJson: unknown = JSON.parse(
  await readFile(new URL("fixtures/stories-report-server.json", import.meta.url), "utf-8"),
);
const report = StoriesManifestReportSchema.parse(reportJson);
const earlierReportKey = "stories-report-2026-07-25.json";
const latestReportKey = "stories-report-2026-07-26.json";
const caption = "</script><script>caption</script>";
const props: ReportContentProps = {
  date: "26 juillet 2026 à 11:48 UTC+2",
  reportKeys: [earlierReportKey, latestReportKey],
  selectedReportKey: latestReportKey,
  users: getRankedUsers(report).map((user) => ({
    user,
    avatar: user.profile_pic_url === null ? undefined : "/media/avatars/avatar.jpg",
    summary: "A text-focused story with extracted details.",
    stories: createStoryCards(user, {
      appleCaptionByMediaPk: new Map([["story-pk-1", "apple <text>"]]),
      cachedImages: {
        profilePicPathByUrl: new Map([["images/avatars/avatar.jpg", "/media/avatars/avatar.jpg"]]),
        storyPreviewPathByUrl: new Map([
          ["images/story-previews/story-pk-1.jpg", "/media/story-previews/story-pk-1.jpg"],
        ]),
      },
      visionByPreviewUrl: new Map(),
    }).map((story) => ({ ...story, igCaption: caption })),
  })),
};
const app = new H3();
app.get(
  "/report",
  () =>
    new globalThis.Response(
      `<!DOCTYPE html>${renderToString(h(ReportPage, { ...props, clientEntry: "/assets/client.js" }))}`,
      { headers: { "Content-Type": "text/html;charset=utf-8" } },
    ),
);
async function request() {
  return await app.fetch(new globalThis.Request("http://localhost/report"));
}

test("report page renders fixture content and its client entry", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html;charset=utf-8");
  const html = await response.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<h1>Rapport du 26 juillet 2026 à 11:48 UTC\+2<\/h1>/u);
  assert.match(html, /Html &quot;User&quot; \(ranked-second\)/u);
  assert.match(html, /A text-focused story with extracted details\./u);
  assert.match(html, /src="\/media\/avatars\/avatar.jpg"/u);
  assert.match(html, /src="\/media\/story-previews\/story-pk-1.jpg"/u);
  assert.doesNotMatch(html, /src="https?:\/\//u);
  assert.match(html, /<div id="app">/u);
  assert.match(html, /<dialog class="image-lightbox" id="image-lightbox"/u);
  assert.match(html, /<script type="module" src="\/assets\/client\.js"><\/script>/u);
  assert.doesNotMatch(html, /data-mono-jsx|data-story-media-pk|on(?:click|change|close)=/u);
  assert.ok(
    html.indexOf("Ranked First (ranked-first)") <
      html.indexOf("Html &quot;User&quot; (ranked-second)"),
  );
  assert.match(html, /<form class="report-picker" action="\/report" method="GET">/u);
  assert.match(html, /<option value="stories-report-2026-07-26.json" selected>/u);
});

test("report page does not embed initial state", async () => {
  const response = await request();
  const html = await response.text();
  assert.doesNotMatch(html, /app-state|app-props|application\/json|<script>caption/u);
});
