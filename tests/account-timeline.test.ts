import { HTTPError } from "nitro/h3";
import { test, expect, type TestContext } from "vitest";
import { loadAccountTimeline } from "../app/loaders/account-timeline.ts";
import { saveCurrentVision } from "./mock-helpers.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";

const owner = { pk: "timeline-pk", username: "timeline-user" };

async function createTimelineRuntime(
  context: TestContext,
  stories: Array<{ pk: string; takenAt: number }>,
) {
  const runtime = await createTestRuntime(context);
  await runtime.users.save({ ...owner, full_name: "Timeline User", id: "timeline-id" });
  for (const { pk, takenAt } of stories) {
    // oxlint-disable-next-line no-await-in-loop -- Stories are saved in a known order.
    await runtime.stories.save({ media_type: 1, pk, taken_at: takenAt }, owner);
  }
  return runtime;
}

function summarizeYears(years: ReturnType<typeof loadAccountTimeline>["timeline"]["years"]) {
  return years.map((year) => ({
    label: year.label,
    months: year.months.map((month) => ({
      key: month.key,
      label: month.label,
      days: month.days.map((day) => ({
        key: day.key,
        stories: day.stories.map((story) => story.story.pk),
      })),
    })),
  }));
}

test("groups stories by their Paris publication day, month, and year", async (context) => {
  const runtime = await createTimelineRuntime(context, [
    { pk: "new-year", takenAt: 1_767_225_600 },
    { pk: "same-day", takenAt: 1_767_226_200 },
    { pk: "previous-year", takenAt: 1_735_689_600 },
  ]);

  const { timeline } = loadAccountTimeline(runtime, "timeline-user");

  expect(summarizeYears(timeline.years)).toStrictEqual([
    {
      label: "2026",
      months: [
        {
          key: "2026-01",
          label: "janvier",
          days: [{ key: "2026-01-01", stories: ["same-day", "new-year"] }],
        },
      ],
    },
    {
      label: "2025",
      months: [
        {
          key: "2025-01",
          label: "janvier",
          days: [{ key: "2025-01-01", stories: ["previous-year"] }],
        },
      ],
    },
  ]);
});

test("sorts months and days newest first across Paris midnight", async (context) => {
  const runtime = await createTimelineRuntime(context, [
    { pk: "january", takenAt: Date.parse("2026-01-01T12:00:00Z") / 1000 },
    { pk: "february-first", takenAt: Date.parse("2026-02-01T12:00:00Z") / 1000 },
    { pk: "february-second", takenAt: Date.parse("2026-02-01T23:30:00Z") / 1000 },
  ]);

  const { timeline } = loadAccountTimeline(runtime, "timeline-user");

  expect(summarizeYears(timeline.years)).toStrictEqual([
    {
      label: "2026",
      months: [
        {
          key: "2026-02",
          label: "février",
          days: [
            { key: "2026-02-02", stories: ["february-second"] },
            { key: "2026-02-01", stories: ["february-first"] },
          ],
        },
        {
          key: "2026-01",
          label: "janvier",
          days: [{ key: "2026-01-01", stories: ["january"] }],
        },
      ],
    },
  ]);
});

test("answers 404 for an unknown user", async (context) => {
  const runtime = await createTestRuntime(context);

  expect(() => loadAccountTimeline(runtime, "missing-user")).toThrow(HTTPError);
});

test("returns an empty timeline for a saved account without stories", async (context) => {
  const runtime = await createTestRuntime(context);
  await runtime.users.save({
    username: "saved-user",
    full_name: "Saved User",
    id: "saved",
    pk: "saved",
  });

  const page = loadAccountTimeline(runtime, "saved-user");

  expect(page.timeline.timelineUser.username).toBe("saved-user");
  expect(page.timeline.avatarPath).toBe("/media/avatars/saved.jpg");
  expect(page.timeline.stories).toStrictEqual([]);
  expect(page.timeline.years).toStrictEqual([]);
  expect(page.stories).toStrictEqual([]);
});

test("assembles timeline media, captions, cached vision and local paths", async (context) => {
  const runtime = await createTestRuntime(context);
  await runtime.users.save({ ...owner, full_name: "Timeline User", id: "timeline-id" });
  await runtime.stories.save(
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
  await runtime.stories.save({ media_type: 2, pk: "video", taken_at: 1_767_225_500 }, owner);
  await runtime.stories.save({ media_type: 99, pk: "unknown", taken_at: 1_767_225_400 }, owner);
  await runtime.appleVision.save("image", "Apple caption");
  await saveCurrentVision(runtime, "video", { text: "visible text", visual: "a street" });

  const page = loadAccountTimeline(runtime, "timeline-user");

  expect(page.timeline.stories.map((entry) => entry.story.pk)).toStrictEqual([
    "image",
    "video",
    "unknown",
  ]);
  expect(page.timeline.avatarPath).toBe("/media/avatars/timeline-pk.jpg");
  expect(page.timeline.timelineUser.username).toBe("timeline-user");
  expect(page.timeline.timelineUser.full_name).toBe("Timeline User");
  expect(page.timeline.timelineUser.stories).toStrictEqual([
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
  expect(
    page.stories.map(({ appleCaption, mediaPk, preview, visionDescription, visionOcr }) => ({
      appleCaption,
      mediaPk,
      preview,
      visionDescription,
      visionOcr,
    })),
  ).toStrictEqual([
    {
      appleCaption: "Apple caption",
      mediaPk: "image",
      preview: "/media/story-previews/image.jpg",
      visionDescription: "—",
      visionOcr: "—",
    },
    {
      appleCaption: "—",
      mediaPk: "video",
      preview: "/media/story-previews/video.jpg",
      visionDescription: "a street",
      visionOcr: "visible text",
    },
    {
      appleCaption: "—",
      mediaPk: "unknown",
      preview: "/media/story-previews/unknown.jpg",
      visionDescription: "—",
      visionOcr: "—",
    },
  ]);
});

test("omits analysis when the stories have no cached details", async (context) => {
  const runtime = await createTimelineRuntime(context, [
    { pk: "plain-story", takenAt: 1_767_225_600 },
  ]);

  const page = loadAccountTimeline(runtime, "timeline-user");

  expect(page.timeline.avatarPath).toBe("/media/avatars/timeline-pk.jpg");
  expect(page.timeline.timelineUser.profile_pic_url).toBe("images/avatars/timeline-pk.jpg");
  expect(
    page.stories.map(({ appleCaption, visionDescription, visionOcr }) => ({
      appleCaption,
      visionDescription,
      visionOcr,
    })),
  ).toStrictEqual([{ appleCaption: "—", visionDescription: "—", visionOcr: "—" }]);
});
