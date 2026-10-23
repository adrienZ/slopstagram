import assert from "node:assert/strict";
import { test } from "vitest";
import { H3 } from "nitro/h3";
import { createPageRenderer } from "./render-page.ts";
import {
  Route,
  UserTimelinePage,
  type TimelineContentProps,
} from "../server/pages/users/$username.tsx";
import { createStoryCards } from "../server/story-card-view-model.ts";
import type { UserTimeline } from "../server/user-timeline.ts";

const entry = {
  full_name: "Timeline User",
  locations: [],
  owner_pk: "user-pk",
  story: { media_type: 1, pk: "story-pk", taken_at: 1_767_225_600 },
  stickers: [],
  taken_at: 1_767_225_600,
  username: "timeline-user",
};
const timeline: UserTimeline = {
  appleCaptionByMediaPk: new Map([["story-pk", "apple <text>"]]),
  avatarPath: "/media/avatar.jpg",
  stories: [entry],
  timelineUser: {
    full_name: entry.full_name,
    profile_pic_url: "images/avatars/user-pk.jpg",
    reel_ids: [],
    stories: [
      {
        ig_caption: "</script><script>caption</script>",
        locations: [],
        media_pk: "story-pk",
        media_type: "image",
        preview_image_url: "images/story-previews/story-pk.jpg",
        status: "ok",
        stickers: [],
      },
    ],
    username: entry.username,
  },
  visionByPreviewUrl: new Map(),
  years: [
    {
      label: "2026",
      months: [
        {
          key: "2026-01",
          label: "janvier",
          days: [{ key: "2026-01-01", label: "01", stories: [entry] }],
        },
      ],
    },
  ],
};

const props: TimelineContentProps = {
  timeline: {
    avatarPath: timeline.avatarPath,
    timelineUser: timeline.timelineUser,
    stories: timeline.stories,
    years: timeline.years,
  },
  stories: createStoryCards(timeline.timelineUser, {
    appleCaptionByMediaPk: timeline.appleCaptionByMediaPk,
    cachedImages: {
      profilePicPathByUrl: new Map([["images/avatars/user-pk.jpg", "/media/avatar.jpg"]]),
      storyPreviewPathByUrl: new Map([
        ["images/story-previews/story-pk.jpg", "/media/story-previews/story-pk.jpg"],
      ]),
    },
    visionByPreviewUrl: timeline.visionByPreviewUrl,
  }),
};
const renderer = createPageRenderer(UserTimelinePage, Route, props, "/users/$username");
const app = new H3();
app.get(
  "/users/timeline-user",
  async () =>
    new globalThis.Response(await renderer.render(), {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    }),
);
async function request() {
  return await app.fetch(new globalThis.Request("http://localhost/users/timeline-user"));
}

test("timeline page renders dated stories", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h2>2026<\/h2>/u);
  assert.match(html, /<h3>janvier<\/h3>/u);
  assert.match(html, /src="\/media\/story-previews\/story-pk.jpg"/u);
});

test("timeline sticker table preserves occurrences across history and caps rows at 50", async () => {
  const kinds = ["mention", "music", "hashtag", "link"];
  const tableProps: TimelineContentProps = {
    ...props,
    timeline: {
      ...props.timeline,
      stories: [
        {
          ...entry,
          story: {
            ...entry.story,
            annotations: {
              locations: [],
              stickers: Array.from({ length: 49 }, (_, position) => ({
                kind: kinds[position % kinds.length],
                label: "repeated sticker",
              })),
            },
          },
        },
        {
          ...entry,
          taken_at: entry.taken_at - 7 * 24 * 60 * 60,
          story: {
            ...entry.story,
            pk: "older-story",
            annotations: {
              locations: ["older <location>"],
              stickers: [
                { kind: "location", label: "older <location>" },
                { kind: "mention", label: "beyond the limit" },
              ],
            },
          },
        },
      ],
    },
  };
  const tableRenderer = createPageRenderer(UserTimelinePage, Route, tableProps, "/users/$username");
  const html = await tableRenderer.render();
  const table = /<table>(?<table>[\s\S]*?)<\/table>/u.exec(html)?.groups?.table ?? "";
  const body = /<tbody>(?<body>[\s\S]*?)<\/tbody>/u.exec(table)?.groups?.body ?? "";
  assert.equal((body.match(/<tr>/gu) ?? []).length, 50);
  assert.equal((body.match(/repeated sticker/gu) ?? []).length, 49);
  for (const kind of [...kinds, "location"]) {
    assert.ok(body.includes(`<td>${kind}</td>`));
  }
  assert.match(body, /older &lt;location&gt;/u);
  assert.doesNotMatch(body, /beyond the limit/u);
  assert.ok(body.indexOf("repeated sticker") < body.indexOf("older &lt;location&gt;"));
  assert.ok(html.indexOf("<table>") < html.indexOf('class="timeline-year"'));
  assert.match(body, /aria-label="Ouvrir aperçu story-pk"/u);
  assert.match(body, /Preview unavailable/u);
  assert.match(body, /<time dateTime="2025-12-25T00:00:00.000Z">/u);
});

test("timeline shows an empty message when no stickers are stored", async () => {
  const html = await renderer.render();
  assert.match(html, /Latest sticker occurrences \(up to 50\)/u);
  assert.match(html, /No sticker occurrences stored\./u);
  assert.doesNotMatch(html, /<table>/u);
});

test("timeline page does not embed initial state", async () => {
  const response = await request();
  const html = await response.text();
  assert.doesNotMatch(html, /app-state|app-props|application\/json|<script>caption/u);
});

test("timeline defers the selected lightbox portal until hydration", async () => {
  const html = await renderer.render("/users/timeline-user?story=story-pk");
  assert.doesNotMatch(html, /<dialog|role="dialog"/u);
  assert.match(html, /data-story-preview="story-pk"/u);
});

test("timeline route reads its username query and URL-selected story", async () => {
  const html = await renderer.renderRoute("/users/timeline-user?story=story-pk");
  assert.match(html, /Timeline User/u);
  assert.match(html, /data-story-preview="story-pk"/u);
  assert.match(html, /\$_TSR/u);
  assert.doesNotMatch(html, /<script>caption/u);
});
