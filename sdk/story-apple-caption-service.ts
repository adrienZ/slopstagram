import { getMediaCacheKey } from "./lib/cache-service.ts";
import type { Logger } from "./lib/logging-service.ts";
import { NO_APPLE_CAPTION } from "./lib/report-constants.ts";
import type { StoryItem, StoryManifestReel } from "./lib/types.ts";

export type AppleCaptionResolver = (story: StoryItem) => Promise<string>;

function getAppleCaptionMediaPks(manifestUsers: StoryManifestReel[]): Set<string> {
  return new Set(
    manifestUsers.flatMap((user) =>
      user.stories.filter((story) => story.status !== "failed").map((story) => story.media_pk),
    ),
  );
}

function createCaptionProgressLogger(
  logger: Logger,
  mediaPksToResolve: Set<string>,
): (mediaPk: string, suffix: string, resolvedCount: number) => void {
  return (mediaPk, suffix, resolvedCount) => {
    if (mediaPksToResolve.size === 0) {
      return;
    }

    logger.progress(resolvedCount, mediaPksToResolve.size, {
      prefix: "apple-captions",
      suffix: `${suffix} ${getMediaCacheKey(mediaPk)}`,
    });
  };
}

function resolveStoryAppleCaption(
  mediaPk: string,
  cachedItems: Map<string, StoryItem>,
  resolver: AppleCaptionResolver,
): Promise<string> {
  const storyItem = cachedItems.get(mediaPk);

  return storyItem ? resolver(storyItem) : Promise.resolve(NO_APPLE_CAPTION);
}

export async function populateAppleCaptions(
  manifestUsers: StoryManifestReel[],
  cachedItems: Map<string, StoryItem>,
  resolver: AppleCaptionResolver,
  logger: Logger,
): Promise<void> {
  const resolvedByMediaPk = new Map<string, string>();
  const mediaPksToResolve = getAppleCaptionMediaPks(manifestUsers);
  const logProgress = createCaptionProgressLogger(logger, mediaPksToResolve);
  let resolvedCount = 0;

  for (const user of manifestUsers) {
    for (const story of user.stories) {
      if (story.status === "failed") {
        story.apple_caption = NO_APPLE_CAPTION;
        continue;
      }

      const cachedCaption = resolvedByMediaPk.get(story.media_pk);
      if (cachedCaption !== undefined && cachedCaption.length > 0) {
        story.apple_caption = cachedCaption;
        continue;
      }

      try {
        logProgress(story.media_pk, "resolving", resolvedCount);
        story.apple_caption = await resolveStoryAppleCaption(story.media_pk, cachedItems, resolver);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`apple ocr failed for story ${story.media_pk}: ${message}`);
        story.apple_caption = NO_APPLE_CAPTION;
      }

      resolvedByMediaPk.set(story.media_pk, story.apple_caption);
      resolvedCount += 1;
      logProgress(story.media_pk, "resolved", resolvedCount);
    }
  }
}
