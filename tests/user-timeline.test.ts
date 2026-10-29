import assert from "node:assert/strict";
import { test, vi } from "vitest";
import {
  createUserTimeline,
  getTimelinePreviewPaths,
  groupStoriesByPublishedDate,
} from "../server/user-timeline.ts";
import { appleVisionRepository } from "../sdk/repositories/apple-vision-repository.ts";
import { visionRepository } from "../sdk/repositories/vision-repository.ts";
import type { UserTimelineStory } from "../sdk/repositories/story-repository.ts";

function timelineStory(pk: string, takenAt: number): UserTimelineStory {
  return {
    full_name: "Timeline User",
    locations: [],
    owner_pk: "user-pk",
    story: { media_type: 1, pk, taken_at: takenAt },
    stickers: [],
    taken_at: takenAt,
    username: "timeline-user",
  };
}

test("groups stories by their Paris publication day, month, and year", () => {
  const timeline = groupStoriesByPublishedDate([
    timelineStory("new-year", 1_767_225_600),
    timelineStory("same-day", 1_767_226_200),
    timelineStory("previous-year", 1_735_689_600),
  ]);

  assert.deepEqual(
    timeline.map((year) => ({
      label: year.label,
      months: year.months.map((month) => ({
        days: month.days.map((day) => ({
          key: day.key,
          stories: day.stories.map((story) => story.story.pk),
        })),
        label: month.label,
      })),
    })),
    [
      {
        label: "2026",
        months: [
          {
            days: [{ key: "2026-01-01", stories: ["new-year", "same-day"] }],
            label: "janvier",
          },
        ],
      },
      {
        label: "2025",
        months: [
          {
            days: [{ key: "2025-01-01", stories: ["previous-year"] }],
            label: "janvier",
          },
        ],
      },
    ],
  );
});

test("returns no timeline for an unknown user", () => {
  const result = createUserTimeline(
    "missing-user",
    {
      listByUsername: (username) => {
        assert.equal(username, "missing-user");
        return [];
      },
    },
    {
      findByUsername: (username) => {
        assert.equal(username, "missing-user");
        return null;
      },
    },
  );
  assert.equal(result, null);
});

test("returns an empty timeline for a saved account without stories", () => {
  const result = createUserTimeline(
    "saved-user",
    { listByUsername: () => [] },
    {
      findByUsername: () => ({
        username: "saved-user",
        full_name: "Saved User",
        id: "saved",
        pk: "saved",
      }),
    },
  );
  assert.ok(result);
  assert.equal(result.timelineUser.username, "saved-user");
  assert.deepEqual(result.stories, []);
  assert.deepEqual(result.years, []);
});

test("assembles timeline media, captions, cached vision and local paths", () => {
  const image = timelineStory("image", 1_767_225_600);
  image.story.accessibility_caption = "Instagram caption";
  image.locations = ["Paris"];
  image.stickers = ["location:Paris"];
  const video = timelineStory("video", 1_767_225_500);
  video.story.media_type = 2;
  const unknown = timelineStory("unknown", 1_767_225_400);
  unknown.story.media_type = 99;
  const stories = [image, video, unknown];
  const vision = { text: "visible text", visual: "a street" };
  vi.spyOn(appleVisionRepository, "findByMediaPk").mockImplementation((pk: string) =>
    pk === "image" ? "Apple caption" : null,
  );
  vi.spyOn(visionRepository, "findByMediaPk").mockImplementation((pk: string) =>
    pk === "video" ? { model: "test-model", prompt_hash: "test-hash", result: vision } : null,
  );

  const timeline = createUserTimeline("timeline-user", {
    listByUsername: (username) => {
      assert.equal(username, "timeline-user");
      return stories;
    },
  });

  assert.ok(timeline);
  assert.equal(timeline.avatarPath, "/media/avatars/user-pk.jpg");
  assert.equal(timeline.timelineUser.username, "timeline-user");
  assert.equal(timeline.timelineUser.full_name, "Timeline User");
  assert.deepEqual(
    timeline.timelineUser.stories,
    stories.map((entry, index) => ({
      ig_caption: index === 0 ? "Instagram caption" : "",
      locations: entry.locations,
      media_type: ["image", "video", null][index],
      media_pk: entry.story.pk,
      preview_image_url: `images/story-previews/${entry.story.pk}.jpg`,
      status: "ok",
      stickers: entry.stickers,
    })),
  );
  assert.deepEqual(timeline.appleCaptionByMediaPk, new Map([["image", "Apple caption"]]));
  assert.deepEqual(
    timeline.visionByPreviewUrl,
    new Map([["images/story-previews/video.jpg", vision]]),
  );
  assert.deepEqual(timeline.stories, stories);
  assert.deepEqual(timeline.years[0]?.months[0]?.days[0]?.stories, stories);
  assert.deepEqual(
    getTimelinePreviewPaths(stories),
    new Map([
      ["images/story-previews/image.jpg", "/media/story-previews/image.jpg"],
      ["images/story-previews/video.jpg", "/media/story-previews/video.jpg"],
      ["images/story-previews/unknown.jpg", "/media/story-previews/unknown.jpg"],
    ]),
  );
});

test("omits avatar and analysis when the story has no owner or cached details", () => {
  const story = timelineStory("no-owner", 1_767_225_600);
  story.owner_pk = null;
  vi.spyOn(appleVisionRepository, "findByMediaPk").mockImplementation(() => null);
  vi.spyOn(visionRepository, "findByMediaPk").mockImplementation(() => null);

  const timeline = createUserTimeline("timeline-user", { listByUsername: () => [story] });

  assert.ok(timeline);
  assert.equal(timeline.avatarPath, null);
  assert.equal(timeline.timelineUser.profile_pic_url, null);
  assert.equal(timeline.appleCaptionByMediaPk.size, 0);
  assert.equal(timeline.visionByPreviewUrl.size, 0);
});

test("skips invalid dates and sorts months and days newest first across Paris midnight", () => {
  const stories = [
    timelineStory("january", Date.parse("2026-01-01T12:00:00Z") / 1000),
    timelineStory("february-first", Date.parse("2026-02-01T12:00:00Z") / 1000),
    timelineStory("february-second", Date.parse("2026-02-01T23:30:00Z") / 1000),
    timelineStory("invalid", Number.NaN),
  ];
  const years = groupStoriesByPublishedDate(stories);

  assert.equal(years.length, 1);
  assert.deepEqual(
    years[0]?.months.map((month) => ({
      key: month.key,
      days: month.days.map((day) => ({
        key: day.key,
        pks: day.stories.map((story) => story.story.pk),
      })),
    })),
    [
      {
        key: "2026-02",
        days: [
          { key: "2026-02-02", pks: ["february-second"] },
          { key: "2026-02-01", pks: ["february-first"] },
        ],
      },
      { key: "2026-01", days: [{ key: "2026-01-01", pks: ["january"] }] },
    ],
  );
});
