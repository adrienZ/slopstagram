import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import { createElement } from "react";
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
const latestReportKey = "stories-report-2026-07-26.json";
const caption = "</script><script>caption</script>";
const props: ReportContentProps = {
  date: "26 juillet 2026 à 11:48 UTC+2",
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
  assert.match(html, /<h1>Stories des dernières 24 heures<\/h1>/u);
  assert.match(html, /Html &quot;User&quot; \(ranked-second\)/u);
  assert.match(html, /A text-focused story with extracted details\./u);
  assert.match(html, /src="\/media\/avatars\/avatar.jpg"/u);
  assert.match(html, /src="\/media\/story-previews\/story-pk-1.jpg"/u);
  assert.doesNotMatch(html, /src="https?:\/\//u);
  assert.doesNotMatch(html, /<dialog|role="dialog"/u);
  assert.doesNotMatch(html, /data-mono-jsx|data-story-media-pk|on(?:click|change|close)=/u);
  assert.ok(
    html.indexOf("Ranked First (ranked-first)") <
      html.indexOf("Html &quot;User&quot; (ranked-second)"),
  );
  assert.doesNotMatch(html, /report-picker|Choisir un rapport|stories-report-/u);
});

test("report defers the selected lightbox portal until hydration", async () => {
  const html = await renderer.render("/report?story=story-pk-1");
  assert.doesNotMatch(html, /<dialog|role="dialog"/u);
  assert.match(html, /data-story-preview="story-pk-1"/u);
  assert.doesNotMatch(html, /<script>caption/u);
});

test("report lightbox stays closed for an unknown story", async () => {
  assert.doesNotMatch(await renderer.render("/report?story=missing"), /<dialog|role="dialog"/u);
});

test("report page does not embed initial state", async () => {
  const response = await request();
  const html = await response.text();
  assert.doesNotMatch(html, /app-state|app-props|application\/json|<script>caption/u);
});

test("report route renders its query result and safely serializes it for hydration", async () => {
  const html = await renderer.renderRoute(`/report?report=${latestReportKey}&story=story-pk-1`);
  assert.match(html, /<h1[^>]*>Stories des dernières 24 heures<\/h1>/u);
  assert.match(html, /data-story-preview="story-pk-1"/u);
  assert.doesNotMatch(html, /stories-report-|report-picker/u);
  assert.match(html, /\$_TSR/u);
  assert.doesNotMatch(html, /<script>caption/u);
});

test("report route query data is isolated between requests", async () => {
  const url = `/report?report=${latestReportKey}`;
  const [first, second] = await Promise.all([
    renderer.renderRoute(url, { ...props, date: "première requête" }),
    renderer.renderRoute(url, { ...props, date: "deuxième requête" }),
  ]);
  assert.match(first, /Fil chargé le première requête/u);
  assert.doesNotMatch(first, /deuxième requête/u);
  assert.match(second, /Fil chargé le deuxième requête/u);
  assert.doesNotMatch(second, /première requête/u);
});

function SelectedStory({ selectedStory }: { selectedStory?: string }) {
  return createElement("output", { "data-selected-story": selectedStory });
}

const selectionRenderer = createPageRenderer(SelectedStory, Route, {}, "/report");

for (const mediaPk of ["12345", "12345678901234568000", "12345678901234567890"]) {
  test(`report deep links preserve numeric Instagram ID ${mediaPk}`, async () => {
    const html = await renderer.renderRoute(`/report?story=${mediaPk}`, {
      ...props,
      users: props.users.map((user) => ({
        ...user,
        stories: user.stories.map((story) => ({ ...story, mediaPk })),
      })),
    });
    assert.ok(html.includes(`data-story-preview="${mediaPk}"`));
    const selection = await selectionRenderer.render(`/report?story=${mediaPk}`);
    assert.ok(selection.includes(`data-selected-story="${mediaPk}"`));
  });
}
