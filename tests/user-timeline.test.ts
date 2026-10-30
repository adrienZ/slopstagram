import { createHash } from "node:crypto";
import { assert, beforeAll, test, expect } from "vitest";
import {
  createUserTimeline,
  getTimelinePreviewPaths,
  groupStoriesByPublishedDate,
} from "../server/user-timeline.ts";
import { appleVisionRepository } from "../sdk/repositories/apple-vision-repository.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { instagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { storyRepository } from "../sdk/repositories/story-repository.ts";
import { visionRepository } from "../sdk/repositories/vision-repository.ts";
import { VISION_MODEL, VISION_PROMPT } from "../sdk/lib/vision-analysis-service.ts";
import type { UserTimelineStory } from "../sdk/repositories/story-repository.ts";

beforeAll(() => {
  migrateDatabase();
});

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

  expect(
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
  ).toStrictEqual([
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
  ]);
});

test("returns no timeline for an unknown user", () => {
  expect(createUserTimeline("missing-user")).toBe(null);
});

test("returns an empty timeline for a saved account without stories", async () => {
  await instagramUserRepository.save({
    username: "saved-user",
    full_name: "Saved User",
    id: "saved",
    pk: "saved",
  });

  const result = createUserTimeline("saved-user");

  assert.ok(result);
  expect(result.timelineUser.username).toBe("saved-user");
  expect(result.avatarPath).toBe("/media/avatars/saved.jpg");
  expect(result.stories).toStrictEqual([]);
  expect(result.years).toStrictEqual([]);
});

test("assembles timeline media, captions, cached vision and local paths", async () => {
  await instagramUserRepository.save({
    full_name: "Timeline User",
    id: "timeline-id",
    pk: "timeline-pk",
    username: "timeline-user",
  });
  const owner = { pk: "timeline-pk", username: "timeline-user" };
  await storyRepository.save(
    {
      accessibility_caption: "Instagram caption",
      media_type: 1,
      pk: "image",
      story_hashtags: [{ hashtag: "food" }],
      story_locations: [{ location: { address: "1 Rue Example, Paris", name: "Cafe Example" } }],
      taken_at: 1_767_225_600,
    },
    owner,
  );
  await storyRepository.save({ media_type: 2, pk: "video", taken_at: 1_767_225_500 }, owner);
  await storyRepository.save({ media_type: 99, pk: "unknown", taken_at: 1_767_225_400 }, owner);
  const vision = { text: "visible text", visual: "a street" };
  await appleVisionRepository.save("image", "Apple caption");
  await visionRepository.save("video", {
    model: VISION_MODEL,
    prompt_hash: createHash("sha256").update(VISION_PROMPT).digest("hex"),
    result: vision,
  });

  const timeline = createUserTimeline("timeline-user");

  assert.ok(timeline);
  const { stories } = timeline;
  expect(stories.map((entry) => entry.story.pk)).toStrictEqual(["image", "video", "unknown"]);
  expect(timeline.avatarPath).toBe("/media/avatars/timeline-pk.jpg");
  expect(timeline.timelineUser.username).toBe("timeline-user");
  expect(timeline.timelineUser.full_name).toBe("Timeline User");
  expect(timeline.timelineUser.stories).toStrictEqual([
    {
      ig_caption: "Instagram caption",
      locations: ["Cafe Example, 1 Rue Example, Paris"],
      media_type: "image",
      media_pk: "image",
      preview_image_url: "images/story-previews/image.jpg",
      status: "ok",
      stickers: ["#food"],
    },
    {
      ig_caption: "",
      locations: [],
      media_type: "video",
      media_pk: "video",
      preview_image_url: "images/story-previews/video.jpg",
      status: "ok",
      stickers: [],
    },
    {
      ig_caption: "",
      locations: [],
      media_type: null,
      media_pk: "unknown",
      preview_image_url: "images/story-previews/unknown.jpg",
      status: "ok",
      stickers: [],
    },
  ]);
  expect(timeline.appleCaptionByMediaPk).toStrictEqual(new Map([["image", "Apple caption"]]));
  expect(timeline.visionByPreviewUrl).toStrictEqual(
    new Map([["images/story-previews/video.jpg", vision]]),
  );
  expect(timeline.years[0]?.months[0]?.days[0]?.stories).toStrictEqual(stories);
  expect(getTimelinePreviewPaths(stories)).toStrictEqual(
    new Map([
      ["images/story-previews/image.jpg", "/media/story-previews/image.jpg"],
      ["images/story-previews/video.jpg", "/media/story-previews/video.jpg"],
      ["images/story-previews/unknown.jpg", "/media/story-previews/unknown.jpg"],
    ]),
  );
});

test("omits analysis when the stories have no cached details", async () => {
  await instagramUserRepository.save({
    full_name: "Plain User",
    id: "plain-id",
    pk: "plain-pk",
    username: "plain-user",
  });
  await storyRepository.save(
    { media_type: 1, pk: "plain-story", taken_at: 1_767_225_600 },
    { pk: "plain-pk", username: "plain-user" },
  );

  const timeline = createUserTimeline("plain-user");

  assert.ok(timeline);
  expect(timeline.avatarPath).toBe("/media/avatars/plain-pk.jpg");
  expect(timeline.timelineUser.profile_pic_url).toBe("images/avatars/plain-pk.jpg");
  expect(timeline.appleCaptionByMediaPk.size).toBe(0);
  expect(timeline.visionByPreviewUrl.size).toBe(0);
});

test("skips invalid dates and sorts months and days newest first across Paris midnight", () => {
  const stories = [
    timelineStory("january", Date.parse("2026-01-01T12:00:00Z") / 1000),
    timelineStory("february-first", Date.parse("2026-02-01T12:00:00Z") / 1000),
    timelineStory("february-second", Date.parse("2026-02-01T23:30:00Z") / 1000),
    timelineStory("invalid", Number.NaN),
  ];
  const years = groupStoriesByPublishedDate(stories);

  expect(years.length).toBe(1);
  expect(
    years[0]?.months.map((month) => ({
      key: month.key,
      days: month.days.map((day) => ({
        key: day.key,
        pks: day.stories.map((story) => story.story.pk),
      })),
    })),
  ).toStrictEqual([
    {
      key: "2026-02",
      days: [
        { key: "2026-02-02", pks: ["february-second"] },
        { key: "2026-02-01", pks: ["february-first"] },
      ],
    },
    { key: "2026-01", days: [{ key: "2026-01-01", pks: ["january"] }] },
  ]);
});
