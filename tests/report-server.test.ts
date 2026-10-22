import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { H3 } from "nitro/h3";
import { StoriesManifestReportSchema } from "../sdk/lib/story-schemas.ts";
import { createPageRenderer } from "./render-page.ts";
import { Route, ReportPage, type ReportContentProps } from "../server/pages/report.tsx";
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
const renderer = createPageRenderer(ReportPage, Route, props, "/report");
const app = new H3();
app.get(
  "/report",
  async () =>
    new globalThis.Response(await renderer.render(), {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    }),
);
async function request() {
  return await app.fetch(new globalThis.Request("http://localhost/report"));
}

test("report page renders fixture content", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html;charset=utf-8");
  const html = await response.text();
  assert.match(html, /<h1>Rapport du 26 juillet 2026 à 11:48 UTC\+2<\/h1>/u);
  assert.match(html, /Html &quot;User&quot; \(ranked-second\)/u);
  assert.match(html, /A text-focused story with extracted details\./u);
  assert.match(html, /src="\/media\/avatars\/avatar.jpg"/u);
  assert.match(html, /src="\/media\/story-previews\/story-pk-1.jpg"/u);
  assert.doesNotMatch(html, /src="https?:\/\//u);
  assert.doesNotMatch(html, /<dialog/u);
  assert.doesNotMatch(html, /data-mono-jsx|data-story-media-pk|on(?:click|change|close)=/u);
  assert.ok(
    html.indexOf("Ranked First (ranked-first)") <
      html.indexOf("Html &quot;User&quot; (ranked-second)"),
  );
  assert.match(html, /<form class="report-picker" action="\/report" method="get">/u);
  assert.match(html, /<option[^>]*value="stories-report-2026-07-26.json" selected="">/u);
});

test("report lightbox renders the story selected by the URL", async () => {
  const html = await renderer.render("/report?story=story-pk-1");
  assert.match(html, /<dialog[^>]*class="image-lightbox" id="image-lightbox"/u);
  assert.match(html, /class="lightbox-detail-media-pk">story-pk-1<\/td>/u);
  assert.match(html, /class="lightbox-detail-apple-caption">apple &lt;text&gt;<\/td>/u);
  assert.doesNotMatch(html, /<script>caption/u);
});

test("report lightbox stays closed for an unknown story", async () => {
  assert.doesNotMatch(await renderer.render("/report?story=missing"), /<dialog/u);
});

test("report page does not embed initial state", async () => {
  const response = await request();
  const html = await response.text();
  assert.doesNotMatch(html, /app-state|app-props|application\/json|<script>caption/u);
});

test("report route renders its query result and safely serializes it for hydration", async () => {
  const html = await renderer.renderRoute(`/report?report=${latestReportKey}&story=story-pk-1`);
  assert.match(html, /<h1[^>]*>Rapport du 26 juillet 2026 à 11:48 UTC\+2<\/h1>/u);
  assert.match(html, /class="lightbox-detail-media-pk">story-pk-1<\/td>/u);
  assert.match(html, /stories-report-2026-07-26.json/u);
  assert.match(html, /\$_TSR/u);
  assert.doesNotMatch(html, /<script>caption/u);
});

test("report route query data is isolated between requests", async () => {
  const url = `/report?report=${latestReportKey}`;
  const [first, second] = await Promise.all([
    renderer.renderRoute(url, { ...props, date: "première requête" }),
    renderer.renderRoute(url, { ...props, date: "deuxième requête" }),
  ]);
  assert.match(first, /Rapport du première requête/u);
  assert.doesNotMatch(first, /deuxième requête/u);
  assert.match(second, /Rapport du deuxième requête/u);
  assert.doesNotMatch(second, /première requête/u);
});

for (const mediaPk of ["12345", "12345678901234568000", "12345678901234567890"]) {
  test(`report deep links preserve numeric Instagram ID ${mediaPk}`, async () => {
    const html = await renderer.renderRoute(`/report?story=${mediaPk}`, {
      ...props,
      users: props.users.map((user) => ({
        ...user,
        stories: user.stories.map((story) => ({ ...story, mediaPk })),
      })),
    });
    assert.ok(html.includes(`class="lightbox-detail-media-pk">${mediaPk}</td>`));
  });
}
