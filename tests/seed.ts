import storiesFixture from "./fixtures/instagram-story-data.json" with { type: "json" };
import { StoryReelSchema } from "../sdk/lib/story-schemas.ts";
import type { InstagramClient, StoryReel, StoryTrayEntry } from "../sdk/instagram-types.ts";
import { fetchStories } from "../sdk/stories.ts";
import { createReport } from "../sdk/report.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import { createMockLogger, noSleep, response } from "./mock-helpers.ts";

const recordedReels = storiesFixture.data.xdt_api__v1__feed__reels_media__connection.edges.map(
  ({ node }) => StoryReelSchema.parse(node),
);

export interface SeedOptions {
  /** Shift publication times so the newest recorded story was published this long before `now`. */
  publishedBefore?: { now: Date; seconds: number };
}

function shiftPublication(reels: Array<StoryReel>, options: SeedOptions): Array<StoryReel> {
  if (options.publishedBefore === undefined) {
    return reels;
  }
  const latest = Math.max(
    ...reels.flatMap((reel) => (reel.items ?? []).map((item) => item.taken_at ?? 0)),
  );
  const target =
    Math.floor(options.publishedBefore.now.getTime() / 1000) - options.publishedBefore.seconds;
  return reels.map((reel) => ({
    ...reel,
    items: reel.items?.map((item) =>
      item.taken_at === undefined ? item : { ...item, taken_at: item.taken_at - latest + target },
    ),
  }));
}

function createRecordedClient(reels: Array<StoryReel>): InstagramClient {
  const tray: Array<StoryTrayEntry> = reels.flatMap((reel) =>
    reel.id === undefined || reel.user === undefined
      ? []
      : [
          {
            id: reel.id,
            media_ids: (reel.items ?? []).map((item) => item.pk),
            user: reel.user,
          },
        ],
  );
  return {
    getTray: async () =>
      await Promise.resolve(
        response({ broadcasts: [], status: "ok", story_ranking_token: "seed", tray }),
      ),
    getReelsMedia: async (reelIds) =>
      await Promise.resolve(
        response({ reels_media: reels.filter((reel) => reelIds.includes(reel.id ?? "")) }),
      ),
  };
}

async function skip(): Promise<void> {
  // Media caching and local models need the network or macOS services.
}

async function skipWithEmptyResults(): Promise<Map<string, never>> {
  return await Promise.resolve(new Map<string, never>());
}

/**
 * Runs the production report pipeline over the recorded Instagram payloads, so the
 * application database holds what a real fetch would store. Media caching, captions,
 * vision and summaries are skipped because they need the network or local models.
 */
export async function seedRecordedStories(options: SeedOptions = {}) {
  const client = createRecordedClient(shiftPublication(recordedReels, options));
  const now = options.publishedBefore?.now;
  const { report } = await createReport({
    logger: createMockLogger(),
    now: now === undefined ? undefined : () => now,
    dependencies: {
      fetchStories: async (args, fetchOptions) =>
        await fetchStories(args, {
          ...fetchOptions,
          client,
          sleep: noSleep,
          storyStorage: createMemoryStorage(),
        }),
      cacheReportAudio: skip,
      cacheReportImages: async () =>
        await Promise.resolve({ profilePicPathByUrl: new Map(), storyPreviewPathByUrl: new Map() }),
      resolveAppleCaptionsForReport: skip,
      resolveVisionForReport: skipWithEmptyResults,
      resolveUserSummariesForReport: skipWithEmptyResults,
    },
  });
  return report;
}
