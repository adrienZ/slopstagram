import { eq, sql } from "drizzle-orm";
import { stories } from "@@/core/domains/database/entities/story.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import { createReportFeed } from "@@/core/domains/story-feed/story-feed.ts";
import { resolveUserSummariesForReport } from "@@/core/domains/accounts/user-summary.ts";
import type { SidebarUser } from "@/loaders/sidebar-users.ts";
import { withStoryStickers, type StoryCardData } from "@/utils/story-cards.ts";
import { groupTimelineLocations } from "@/utils/timeline-locations.ts";
import { groupTimelineStickers } from "@/utils/timeline-stickers.ts";
import {
  editRecordedStories,
  editRecordedUsers,
  readRecordedPayloads,
  seedRecordedStories,
} from "@@/tests/setup/seed.ts";

export const pageNow = new Date("2026-07-26T12:00:00.000Z");
/** Publication of the newest recorded story, before `pageNow`. */
const PUBLISHED_BEFORE_SECONDS = 3600;
/** Moves a recorded story out of the rolling 24 hour feed, onto the previous day. */
const PAST_STORY_AGE_SECONDS = 26 * 3600;
export const today = "2026-07-26";
export const pastDay = "2026-07-25";
export const emptyDay = "2026-07-24";

/** The account whose section comes first in the feed: a display name distinct from its handle. */
export const namedAccount = {
  username: "user_072",
  fullName: "Fixture text 69",
};
/** The account with stories on two days, rendered by the timeline page. */
export const timelineAccount = namedAccount.username;
/** Saved by the application but without any story in the feed. */
export const outsideFeedAccount = "user_901";
/** Saved by the application: the account the first story's mention stickers point at. */
export const mentionedAccount = "user_114";

/** An image story that mentions the saved account above and carries both captions below. */
export const captionedStoryPk = "700000000000107";
/** Published the previous day, so it is only reachable by its day. */
const pastStoryPk = "700000000000116";
export const hostileCaption = "</script><script>caption</script>";
export const appleCaption = "apple <text>";
export const userSummary = "A synthetic summary of the recorded stories.";

/**
 * Seeds a runtime's database with what the page tests render: the recorded stories through
 * production ingestion, plus the accounts, captions and summaries that ingestion does not
 * produce.
 */
export async function seedPageDatabase(runtime: Runtime): Promise<void> {
  await seedRecordedStories(runtime, await readRecordedPayloads(), {
    publishedBefore: { now: pageNow, seconds: PUBLISHED_BEFORE_SECONDS },
  });
  // The recording has neither a markup-laden caption nor a story outside the rolling 24 hours.
  const { database } = runtime;
  database
    .update(stories)
    .set({ accessibilityCaption: hostileCaption })
    .where(eq(stories.mediaPk, captionedStoryPk))
    .run();
  database
    .update(stories)
    .set({ takenAt: sql`${stories.takenAt} - ${PAST_STORY_AGE_SECONDS}` })
    .where(eq(stories.mediaPk, pastStoryPk))
    .run();
  await runtime.appleVision.save(captionedStoryPk, appleCaption);
  for (const [pk, username] of [
    ["700000000000901", outsideFeedAccount],
    ["700000000000114", mentionedAccount],
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- Two inserts, saved in order.
    await runtime.users.save({
      full_name: null,
      id: pk,
      pk,
      username,
    });
  }
  await resolveUserSummariesForReport(
    runtime,
    { output: { users: createReportFeed(runtime, pageNow).users } },
    { runUserSummary: async () => await Promise.resolve(JSON.stringify({ summary: userSummary })) },
  );
}

/** The sticker kinds the loader reports for a set of stories: the distinct kinds, alphabetically. */
export function stickerKindsOf(
  entries: Array<{
    story: { annotations?: { stickers: Array<{ kind: string }> } };
  }>,
): Array<string> {
  return [
    ...new Set(
      entries.flatMap(({ story }) => story.annotations?.stickers.map(({ kind }) => kind) ?? []),
    ),
  ].toSorted();
}

/** Recomputes what the loader derives from a timeline's stories, after a test changed them. */
export function regroupTimeline<
  Props extends {
    sidebarUsers: Array<SidebarUser>;
    stories: Array<StoryCardData>;
    timeline: { stories: Array<Parameters<typeof groupTimelineLocations>[0][number]> };
  },
>(props: Props, kinds: Array<string> = stickerKindsOf(props.timeline.stories)) {
  return {
    ...props,
    stories: withStoryStickers(props.stories, props.timeline.stories, props.sidebarUsers),
    stickerGroups: groupTimelineStickers(props.timeline.stories, kinds),
    locations: groupTimelineLocations(props.timeline.stories),
  };
}

/** The recorded accounts, renamed so that each has distinct initials, in recording order. */
export const mapAccounts = ["ada_map", "ben_map", "cleo_map"] as const;
/** A place two accounts tagged: the oldest recorded story, then a newer one of the third account. */
export const sharedPlace = {
  name: "Fixture place 1",
  oldestPk: "700000000000079",
  latestPk: "700000000000903",
};
/** A place only the second account tagged. */
export const soloPlace = { name: "Fixture place 2", pk: "700000000000090" };

/**
 * Seeds a runtime's database with what the map page renders: the recorded stories through
 * production ingestion, with the accounts renamed and location stickers the recording lacks
 * (a shared place, a place of its own, and a place without coordinates). No place lookup is
 * recorded, so the places keep the positions their stickers carry.
 */
export async function seedMapDatabase(runtime: Runtime): Promise<void> {
  const recorded = editRecordedUsers(
    await readRecordedPayloads(["instagram-story-data.json"]),
    (user, position) => {
      user.username = mapAccounts[position] ?? user.username;
    },
  );
  await seedRecordedStories(
    runtime,
    editRecordedStories(recorded, (story) => {
      if (story.pk === sharedPlace.oldestPk) {
        story.story_locations = [
          {
            id: "700000000000912",
            location: { pk: "700000000000930", name: sharedPlace.name, lat: 48.8, lng: 12.5 },
          },
        ];
      }
      if (story.pk === soloPlace.pk) {
        story.story_locations = [
          {
            id: "700000000000913",
            location: { pk: "700000000000940", name: soloPlace.name, lat: 45.1, lng: 5.7 },
          },
          {
            id: "700000000000914",
            location: { pk: "700000000000950", name: "Fixture place without position" },
          },
        ];
      }
    }),
    { publishedBefore: { now: pageNow, seconds: PUBLISHED_BEFORE_SECONDS } },
  );
}
