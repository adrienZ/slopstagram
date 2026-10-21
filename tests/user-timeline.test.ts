import assert from "node:assert/strict";
import { test } from "node:test";
import { groupStoriesByPublishedDate } from "../server/user-timeline.ts";
import type { UserTimelineStory } from "../sdk/lib/types.ts";

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
