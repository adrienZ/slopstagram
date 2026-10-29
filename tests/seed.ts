import storiesFixture from "./fixtures/instagram-story-data.json" with { type: "json" };
import { fetchStories } from "../sdk/stories.ts";
import { persistReportInstagramUsers } from "../sdk/lib/instagram-user-service.ts";
import { createInstagramClient } from "../sdk/story-client-service.ts";
import { createRecordedSession } from "./instagram-session.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import { appleVisionRepository } from "../sdk/repositories/apple-vision-repository.ts";
import { storyRepository } from "../sdk/repositories/story-repository.ts";
import { createMockLogger, noSleep, storyItem } from "./mock-helpers.ts";

const recordedGallery = storiesFixture.data.xdt_api__v1__feed__reels_media__connection;

export interface SeedOptions {
  /** Shift publication times so the newest recorded story was published this long before `now`. */
  publishedBefore?: { now: Date; seconds: number };
}

function shiftedReels(options: SeedOptions) {
  const reels = recordedGallery.edges.map(({ node }) => node);
  if (options.publishedBefore === undefined) {
    return reels;
  }
  const latest = Math.max(...reels.flatMap(({ items }) => items.map((item) => item.taken_at)));
  const target =
    Math.floor(options.publishedBefore.now.getTime() / 1000) - options.publishedBefore.seconds;
  return reels.map((reel) => ({
    ...reel,
    items: reel.items.map((item) => ({ ...item, taken_at: item.taken_at - latest + target })),
  }));
}

/**
 * Ingests the recorded Instagram payloads into the application database the way
 * createReport does: the real Instagram client over a session that serves
 * the recordings, then the real fetch and user persistence. Only the browser is replaced.
 */
export async function seedRecordedStories(options: SeedOptions = {}) {
  const reels = shiftedReels(options);
  const session = createRecordedSession({
    tray: {
      broadcasts: [],
      story_ranking_token: "seed",
      status: "ok",
      tray: reels.map((reel) => ({
        id: reel.id,
        media_ids: reel.items.map(({ pk }) => pk),
        user: reel.user,
      })),
    },
    galleryPage: (reelIds) => ({
      data: {
        xdt_api__v1__feed__reels_media__connection: {
          edges: reels.filter(({ id }) => reelIds.includes(id)).map((node) => ({ node })),
          page_info: { has_next_page: false, end_cursor: null },
        },
      },
    }),
  });
  const now = options.publishedBefore?.now;
  const report = await fetchStories([], {
    client: createInstagramClient(session),
    logger: createMockLogger(),
    now: now === undefined ? undefined : () => now,
    sleep: noSleep,
    storyStorage: createMemoryStorage(),
  });
  await persistReportInstagramUsers(globalThis.structuredClone(report));
  return report;
}

export const pageNow = new Date("2026-07-26T12:00:00.000Z");
export const captionedStoryPk = "700000000000271";
export const pastStoryPk = "700000000000999";
/** Older than the rolling 24 hour feed, so the story is only reachable by its day. */
export const PAST_STORY_AGE_SECONDS = 26 * 3600;
export const hostileCaption = "</script><script>caption</script>";
export const appleCaption = "apple <text>";
const captionedOwner = { pk: "700000000000188", username: "user_041" };

/**
 * Seeds what the page tests render: the recorded stories published an hour before
 * `pageNow`, plus what the recordings lack, saved through the real repositories: a
 * caption that must be escaped, an Apple caption, and a story from the previous day.
 */
export async function seedPageData(now: Date = pageNow): Promise<void> {
  await seedRecordedStories({ publishedBefore: { now, seconds: 3600 } });
  const recorded = storyRepository.findByMediaPk(captionedStoryPk);
  if (recorded === null) {
    throw new Error(`Recorded story ${captionedStoryPk} was not ingested`);
  }
  await storyRepository.save(
    { ...recorded, accessibility_caption: hostileCaption },
    captionedOwner,
  );
  await appleVisionRepository.save(captionedStoryPk, appleCaption);
  await storyRepository.save(
    {
      ...storyItem(pastStoryPk),
      taken_at: Math.floor(now.getTime() / 1000) - PAST_STORY_AGE_SECONDS,
    },
    captionedOwner,
  );
}
