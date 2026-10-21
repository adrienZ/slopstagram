import assert from "node:assert/strict";
import { after, test } from "node:test";
import { H3 } from "nitro/h3";
import { createPageRenderer } from "./render-page.ts";
import type { TimelineContentProps } from "../server/pages/users/[username].tsx";
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
const renderer = await createPageRenderer(
  "/server/pages/users/[username].tsx",
  "UserTimelinePage",
  props,
);
after(async () => {
  await renderer.close();
});
const app = new H3();
app.get(
  "/users/timeline-user",
  () =>
    new globalThis.Response(renderer.render(), {
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

test("timeline page does not embed initial state", async () => {
  const response = await request();
  const html = await response.text();
  assert.doesNotMatch(html, /app-state|app-props|application\/json|<script>caption/u);
});
