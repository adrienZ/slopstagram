import assert from "node:assert/strict";
import { test } from "vitest";
import { renderPage, renderRoute } from "./render-page.ts";
import ReportRoute, { ReportPage, route } from "../server/pages/report.tsx";
import { getReport } from "../server/query-service.ts";
import { latestReportKey, reportProps as props } from "./fixtures/page-data.ts";

function render(url = "/report") {
  return renderPage(ReportPage, props, url);
}

async function renderQueryRoute(url: string, data = props) {
  return await renderRoute({
    component: ReportRoute,
    route,
    path: "/report",
    url,
    queryKey: getReport.keyFor(latestReportKey),
    data,
  });
}

test("report page renders fixture content", () => {
  const html = render();
  assert.match(html, /<h1>Rapport du 26 juillet 2026 à 11:48 UTC\+2<\/h1>/u);
  assert.match(html, /Html &quot;User&quot; \(ranked-second\)/u);
  assert.match(html, /A text-focused story with extracted details\./u);
  assert.match(html, /src="\/media\/avatars\/avatar.jpg"/u);
  assert.match(html, /src="\/media\/story-previews\/story-pk-1.jpg"/u);
  assert.doesNotMatch(html, /src="https?:\/\//u);
  assert.doesNotMatch(html, /<dialog/u);
  assert.doesNotMatch(html, /data-mono-jsx|data-story-media-pk|on(?:click|change|close)=/u);
  assert.ok(
    html.indexOf("Ranked First (ranked-first)") < html.indexOf('Html "User" (ranked-second)'),
  );
  assert.match(html, /<form class="report-picker" action="\/report" method="get">/u);
  assert.match(html, /<option[^>]*value="stories-report-2026-07-26.json" selected>/u);
});

test("report lightbox renders the story selected by the URL", () => {
  const html = render("/report?story=story-pk-1");
  assert.match(html, /<dialog[^>]*class="image-lightbox" id="image-lightbox"/u);
  assert.match(html, /class="lightbox-detail-media-pk">story-pk-1<\/td>/u);
  assert.match(html, /class="lightbox-detail-apple-caption">apple &lt;text><\/td>/u);
  assert.doesNotMatch(html, /<script>caption/u);
});

test("report lightbox stays closed for an unknown story", () => {
  assert.doesNotMatch(render("/report?story=missing"), /<dialog/u);
});

test("report page does not embed initial state", () => {
  const html = render();
  assert.doesNotMatch(html, /app-state|app-props|application\/json|<script>caption/u);
});

test("report route renders its query result and safely serializes it for hydration", async () => {
  const html = await renderQueryRoute(`/report?report=${latestReportKey}&story=story-pk-1`);
  assert.match(html, /<h1[^>]*>Rapport du 26 juillet 2026 à 11:48 UTC\+2<\/h1>/u);
  assert.match(html, /class="lightbox-detail-media-pk">story-pk-1<\/td>/u);
  assert.match(html, /stories-report-2026-07-26.json/u);
  assert.match(html, /_\$HY\.r\[/u);
  assert.doesNotMatch(html, /<script>caption/u);
});

test("report route query data is isolated between requests", async () => {
  const url = `/report?report=${latestReportKey}`;
  const [first, second] = await Promise.all([
    renderQueryRoute(url, { ...props, date: "première requête" }),
    renderQueryRoute(url, { ...props, date: "deuxième requête" }),
  ]);
  assert.match(first, /Rapport du première requête/u);
  assert.doesNotMatch(first, /deuxième requête/u);
  assert.match(second, /Rapport du deuxième requête/u);
  assert.doesNotMatch(second, /première requête/u);
});
