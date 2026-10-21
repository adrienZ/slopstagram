import assert from "node:assert/strict";
import { test } from "vitest";
import { renderPage, renderRoute } from "./render-page.ts";
import UserTimelineRoute, { UserTimelinePage, route } from "../server/pages/users/[username].tsx";
import { getUserTimeline } from "../server/query-service.ts";
import { timelineProps as props } from "./fixtures/page-data.ts";

function render(url = "/users/timeline-user") {
  return renderPage(UserTimelinePage, props, url);
}

async function renderQueryRoute(url: string, data = props) {
  return await renderRoute({
    component: UserTimelineRoute,
    route,
    path: "/users/:username",
    url,
    queryKey: getUserTimeline.keyFor("timeline-user"),
    data,
  });
}

test("timeline page renders dated stories", () => {
  const html = render();
  assert.match(html, /<h2>2026<\/h2>/u);
  assert.match(html, /<h3>janvier<\/h3>/u);
  assert.match(html, /src="\/media\/story-previews\/story-pk.jpg"/u);
});

test("timeline page does not embed initial state", () => {
  const html = render();
  assert.doesNotMatch(html, /app-state|app-props|application\/json|<script>caption/u);
});

test("timeline lightbox renders the story selected by the URL", () => {
  const html = render("/users/timeline-user?story=story-pk");
  assert.match(html, /<dialog[^>]*class="image-lightbox" id="image-lightbox"/u);
  assert.match(html, /class="lightbox-detail-media-pk">story-pk<\/td>/u);
});

test("timeline route reads its username query and URL-selected story", async () => {
  const html = await renderQueryRoute("/users/timeline-user?story=story-pk");
  assert.match(html, /Timeline User/u);
  assert.match(html, /class="lightbox-detail-media-pk">story-pk<\/td>/u);
  assert.match(html, /_\$HY\.r\[/u);
  assert.doesNotMatch(html, /<script>caption/u);
});
