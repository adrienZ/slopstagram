import { eq, sql } from "drizzle-orm";
import { stories } from "@@/core/database/entities/story.ts";
import type { Runtime } from "@@/core/runtime/runtime.ts";
import { createReportFeed } from "@@/core/domains/story-feed/story-feed.ts";
import { resolveUserSummariesForReport } from "@@/core/domains/accounts/user-summary.ts";
import type { SidebarUser } from "../../app/loaders/sidebar-users.ts";
import { withStoryStickers, type StoryCardData } from "../../app/utils/story-cards.ts";
import { groupTimelineLocations } from "../../app/utils/timeline-locations.ts";
import { groupTimelineStickers } from "../../app/utils/timeline-stickers.ts";
import { readRecordedPayloads, seedRecordedStories } from "../setup/seed.ts";

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
