import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { H3, defineEventHandler } from "nitro/h3";
import { getReportUserKey } from "../sdk/lib/report-user-key-service.ts";
import { StoriesManifestReportSchema } from "../sdk/lib/story-schemas.ts";
import type { StoriesManifestReport } from "../sdk/lib/types.ts";
import type { ReportViewModel } from "../server/report-view-model.ts";
import { mockModule } from "./mock-helpers.ts";

const reportJson: unknown = JSON.parse(
  await readFile(new URL("./fixtures/stories-report-server.json", import.meta.url), "utf8"),
);
const storiesReport = StoriesManifestReportSchema.parse(reportJson);
const reportKeys = ["stories-report-earlier.json", "stories-report-fixture.json"];
let requestedReportKey: string | undefined;

mockModule("../server/report-cache.ts", {
  getCachedReportKeys: () => reportKeys,
  readCachedReport: (reportKey: string) => {
    requestedReportKey = reportKey;
    if (reportKey !== "stories-report-fixture.json") {
      throw new Error(`cached report ${reportKey} could not be read`);
    }
    return globalThis.structuredClone(storiesReport);
  },
});

mockModule("../server/report-view-model.ts", {
  createReportViewModel: (fixture: StoriesManifestReport): Promise<ReportViewModel> =>
    Promise.resolve({
      cachedImages: {
        profilePicPathByUrl: new Map([["https://example.com/avatar.jpg", "/media/avatar.jpg"]]),
        storyPreviewPathByUrl: new Map([["https://example.com/story.jpg", "/media/story.jpg"]]),
      },
      report: fixture,
      userSummaryByUserKey: new Map([
        [getReportUserKey(fixture.output.users[0]), "A text-focused story with extracted details."],
      ]),
      visionByPreviewUrl: new Map([
        ["https://example.com/story.jpg", { text: "OCR text", visual: "Vision text" }],
      ]),
    }),
});

const { renderReport } = await import("../server/report-handler.tsx");
const app = new H3();
app.on("GET", "/", defineEventHandler(renderReport));
app.on("GET", "/report", defineEventHandler(renderReport));
const request = app.fetch.bind(app);

test("GET /report renders the latest fixture report", async () => {
  const response = await request(new globalThis.Request("http://localhost/report"));

  assert.equal(response.status, 200);
  assert.equal(requestedReportKey, "stories-report-fixture.json");

  const html = await response.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<h1>Rapport du 26 juillet 2026 à 11:48 UTC\+2<\/h1>/u);
  assert.match(html, /Html &quot;User&quot; \(ranked-second\)/u);
  assert.match(html, /A text-focused story with extracted details\./u);
  assert.match(html, /src="\/media\/avatar.jpg"/u);
  assert.match(html, /src="\/media\/story.jpg"/u);
  assert.doesNotMatch(html, /src="https?:\/\//u);
  assert.match(
    html,
    /data-story-url="https:\/\/www\.instagram\.com\/stories\/ranked-second\/story-pk-1\/"/u,
  );
  assert.match(html, /data-story-stickers="link:A &amp; B"/u);
  assert.match(html, /data-story-apple-caption="apple &lt;text&gt;"/u);
  assert.match(html, /data-story-vision-ocr="OCR text"/u);
  assert.match(html, /<dialog class="image-lightbox" id="image-lightbox"/u);
  assert.match(html, /const dialog = document\.querySelector\("#image-lightbox"\)/u);
  assert.match(html, /const openParam = "story"/u);
  assert.match(html, /url\.searchParams\.set\(openParam, value\)/u);
  assert.match(html, /dialog\.addEventListener\("close", clearOpenParam\)/u);
  assert.match(
    html,
    /const initialStory = new URL\(location\.href\)\.searchParams\.get\(openParam\)/u,
  );
  assert.ok(
    html.indexOf("Ranked First (ranked-first)") <
      html.indexOf("Html &quot;User&quot; (ranked-second)"),
  );
});

test("GET /report selects a requested report and returns 404 when unavailable", async () => {
  const selectedResponse = await request(
    new globalThis.Request("http://localhost/report?report=stories-report-fixture.json"),
  );
  assert.equal(selectedResponse.status, 200);
  assert.equal(requestedReportKey, "stories-report-fixture.json");

  const missingResponse = await request(
    new globalThis.Request("http://localhost/report?report=stories-report-missing.json"),
  );
  assert.equal(missingResponse.status, 404);
  assert.equal(
    await missingResponse.text(),
    "cached report stories-report-missing.json could not be read",
  );
});
