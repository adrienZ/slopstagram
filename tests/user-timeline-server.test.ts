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
  today: "2026-10-23",
  stickerKinds: ["hashtag", "link", "location", "mention", "music"],
  sidebarUsers: [
    { username: "timeline-user", avatarPath: "/media/avatar.jpg" },
    { username: "other-user", avatarPath: null },
  ],
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
  assert.match(html, /<h2[^>]*>2026<\/h2>/u);
  assert.match(html, /<h3[^>]*>janvier<\/h3>/u);
  assert.match(html, /src="\/media\/story-previews\/story-pk.jpg"/u);
});

test("timeline shares the sidebar and exposes scroll targets for its available calendar days", async () => {
  const html = await renderer.renderRoute("/users/timeline-user");
  assert.match(html, /Navigation des stories/u);
  assert.match(html, /id="story-day-2026-01-01"/u);
  assert.match(html, /<button[^>]*aria-label="[^"]*1 janvier 2026[^"]*"/u);
  const unavailable =
    /<button[^>]*aria-label="[^"]*vendredi 2 janvier 2026[^"]*"[^>]*>/u.exec(html)?.[0] ?? "";
  assert.match(unavailable, /disabled=""/u);
  assert.doesNotMatch(html, /href="\/report\?date=/u);
  assert.match(html, /aria-label="Choisir le thème"/u);
});

test("sidebar links all saved accounts and marks the current user", async () => {
  const html = await renderer.renderRoute("/users/timeline-user");
  assert.match(html, /<nav aria-label="Utilisateurs">/u);
  assert.match(html, /<a[^>]*href="\/users\/timeline-user"[^>]*aria-current="page"/u);
  assert.match(html, /href="\/users\/other-user"/u);
  assert.match(html, /data-slot="avatar"/u);
  assert.match(html, /data-slot="sidebar-menu-sub"/u);
  assert.match(html, /data-slot="sidebar-menu-sub-button"/u);
});

test("saved accounts without stories render an empty page", async () => {
  const html = await renderer.renderRoute("/users/timeline-user", {
    ...props,
    stories: [],
    timeline: { ...props.timeline, stories: [], years: [] },
  });
  assert.match(html, /Aucune story enregistrée pour cet utilisateur/u);
  assert.match(html, /href="\/users\/other-user"/u);
});

test("sticker cards render every database kind, with three results and pagination", async () => {
  const tableProps: TimelineContentProps = {
    ...props,
    timeline: {
      ...props.timeline,
      stories: Array.from({ length: 7 }, (_, index) => ({
        ...entry,
        taken_at: entry.taken_at - index * 60,
        story: {
          ...entry.story,
          pk: `sticker-${index}`,
          annotations: { locations: [], stickers: [{ kind: "mention", label: `@user-${index}` }] },
        },
      })),
    },
  };
  const tableRenderer = createPageRenderer(UserTimelinePage, Route, tableProps, "/users/$username");
  const html = await tableRenderer.render();
  assert.equal((html.match(/aria-label="Type de sticker : /gu) ?? []).length, 5);
  assert.equal((html.match(/data-slot="empty"/gu) ?? []).length, 0);
  const table =
    /<table[^>]*aria-label="Stickers : mention"[^>]*>(?<table>[\s\S]*?)<\/table>/u.exec(html)
      ?.groups?.table ?? "";
  assert.equal((table.match(/data-slot="table-row"/gu) ?? []).length, 4);
  assert.match(table, /@user-0/u);
  assert.match(table, /@user-2/u);
  assert.doesNotMatch(table, /@user-3|@user-4|@user-5|@user-6/u);
  assert.match(html, /aria-label="Page suivante : mention"/u);
  assert.match(html, /aria-label="Tout afficher : mention"/u);
  assert.match(html, /aria-label="Afficher ou masquer : mention"/u);
});

test("empty sticker cards stay collapsed and do not offer expansion", async () => {
  const html = await renderer.render();
  assert.equal((html.match(/aria-label="Type de sticker : /gu) ?? []).length, 5);
  assert.equal((html.match(/Aucun sticker/gu) ?? []).length, 5);
  assert.doesNotMatch(html, /aria-label="Tout afficher :|aria-label="Afficher ou masquer :/u);
  assert.doesNotMatch(html, /<table[^>]*aria-label="Stickers :/u);
});

test("sticker mentions link to saved accounts and leave unknown users as text", async () => {
  const html = await renderer.renderRoute("/users/timeline-user", {
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
              stickers: [
                { kind: "mention", label: "@OTHER-user" },
                { kind: "mention", label: "@unknown-user" },
              ],
            },
          },
        },
      ],
    },
  });
  const table =
    /<table[^>]*aria-label="Stickers : mention"[^>]*>(?<table>[\s\S]*?)<\/table>/u.exec(html)
      ?.groups?.table ?? "";
  assert.match(table, /<a[^>]*href="\/users\/other-user"[^>]*>@OTHER-user<\/a>/u);
  assert.doesNotMatch(table, /href="\/users\/unknown-user"/u);
  assert.match(table, />@unknown-user<\/span>/u);
});

test("timeline renders a photo grid grouped by day", async () => {
  const html = await renderer.render();
  assert.match(html, /aria-label="Galerie des stories"/u);
  assert.match(html, /id="story-day-2026-01-01"/u);
  assert.match(html, /grid-cols-\[repeat\(auto-fill/u);
  assert.match(html, /aspect-\[9\/14\]/u);
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
  assert.equal((html.match(/<main(?:\s|>)/gu) ?? []).length, 1);
  assert.doesNotMatch(html, /href="\/css\//u);
  assert.match(html, /Timeline User/u);
  assert.match(html, /data-story-preview="story-pk"/u);
  assert.match(html, /\$_TSR/u);
  assert.doesNotMatch(html, /<script>caption/u);
});
