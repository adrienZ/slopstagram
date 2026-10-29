/**
 * What the UI page tests know about the seeded database (see tests/ui/global-setup.ts).
 * Constants only, so jsdom tests can import it without touching the database.
 */
export const pageNow = new Date("2026-07-26T12:00:00.000Z");
/** Publication of the newest recorded story, before `pageNow`. */
export const PUBLISHED_BEFORE_SECONDS = 3600;
/** Moves a recorded story out of the rolling 24 hour feed, onto the previous day. */
export const PAST_STORY_AGE_SECONDS = 26 * 3600;
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
export const pastStoryPk = "700000000000116";
export const hostileCaption = "</script><script>caption</script>";
export const appleCaption = "apple <text>";
export const userSummary = "A synthetic summary of the recorded stories.";
