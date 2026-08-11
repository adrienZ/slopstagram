import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mock, test } from "node:test";
import { getReportUserKey } from "../scripts/lib/report-user-key-service.ts";
import type { StoriesManifestReport } from "../scripts/lib/types.ts";
import type { ReportViewModel } from "../server/report-view-model.ts";

const report = JSON.parse(
  await readFile(new URL("./fixtures/stories-report-server.json", import.meta.url), "utf8"),
) as StoriesManifestReport;
const reportKeys = ["stories-report-earlier.json", "stories-report-fixture.json"];
let requestedReportKey: string | undefined;

mock.module("../server/report-cache.ts", {
  namedExports: {
    getCachedReportKeys: async () => reportKeys,
    readCachedReport: async (reportKey: string) => {
      requestedReportKey = reportKey;
      if (reportKey !== "stories-report-fixture.json") {
        throw new Error(`cached report ${reportKey} could not be read`);
      }
      return structuredClone(report);
    },
  },
});

mock.module("../server/report-view-model.ts", {
  namedExports: {
    createReportViewModel: async (fixture: StoriesManifestReport): Promise<ReportViewModel> => ({
      cachedImages: {
        profilePicPathByUrl: new Map([["https://example.com/avatar.jpg", "/images/avatar.jpg"]]),
        storyPreviewPathByUrl: new Map([["https://example.com/story.jpg", "/images/story.jpg"]]),
      },
      report: fixture,
      userSummaryByUserKey: new Map([
        [
          getReportUserKey(fixture.output.users[0]!),
          "A text-focused story with extracted details.",
        ],
      ]),
      visionByPreviewUrl: new Map([
        ["https://example.com/story.jpg", { text: "OCR text", visual: "Vision text" }],
      ]),
    }),
  },
});

const { default: app } = await import("../server/app.ts");

test("GET /report renders the latest fixture report", async () => {
  const response = await app.request("/report");

  assert.equal(response.status, 200);
  assert.equal(requestedReportKey, "stories-report-fixture.json");

  const html = await response.text();
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /<h1>Rapport du 26 juillet 2026 à 11:48 UTC\+2<\/h1>/);
  assert.match(html, /Html &quot;User&quot; \(ranked-second\)/);
  assert.match(html, /A text-focused story with extracted details\./);
  assert.match(html, /src="\/images\/avatar.jpg"/);
  assert.match(html, /src="\/images\/story.jpg"/);
  assert.doesNotMatch(html, /src="https?:\/\//);
  assert.match(
    html,
    /data-story-url="https:\/\/www\.instagram\.com\/stories\/ranked-second\/story-pk-1\/"/,
  );
  assert.match(html, /data-story-stickers="link:A &amp; B"/);
  assert.match(html, /data-story-apple-caption="apple &lt;text&gt;"/);
  assert.match(html, /data-story-vision-ocr="OCR text"/);
  assert.match(html, /<dialog class="css-[^"]+ image-lightbox" id="image-lightbox"/);
  assert.match(html, /const dialog=document\.querySelector\('#image-lightbox'\)/);
  assert.ok(
    html.indexOf("Ranked First (ranked-first)") <
      html.indexOf("Html &quot;User&quot; (ranked-second)"),
  );
});

test("GET /report selects a requested report and returns 404 when unavailable", async () => {
  const selectedResponse = await app.request("/report?report=stories-report-fixture.json");
  assert.equal(selectedResponse.status, 200);
  assert.equal(requestedReportKey, "stories-report-fixture.json");

  const missingResponse = await app.request("/report?report=stories-report-missing.json");
  assert.equal(missingResponse.status, 404);
  assert.equal(
    await missingResponse.text(),
    "cached report stories-report-missing.json could not be read",
  );
});
