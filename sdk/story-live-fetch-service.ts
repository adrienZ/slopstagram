import type { Logger } from "./lib/logging-service.ts";
import type { StoryStorage } from "./lib/types.ts";
import { extractReels } from "./story-client-service.ts";
import { cacheReturnedReels } from "./story-cache-service.ts";
import {
  addFailuresForPendingReelStories,
  createMissingResponseFailure,
  getRemainingReelIds,
  logStoryProgress,
  type FetchState,
} from "./story-failure-service.ts";
import {
  chunk,
  requestWithRetry,
  type RequestFailure,
  type RetryOptions,
} from "./story-retry-service.ts";
import type { InstagramClient } from "./stories.ts";

export type FetchMissingStoriesOptions = {
  client: InstagramClient;
  logger: Logger;
  reelIdsPerRequest: number;
  retryOptions: RetryOptions;
  state: FetchState;
  storyStorage: StoryStorage;
  trayReelIds: string[];
};

function getReelIdsToFetch(options: Pick<FetchMissingStoriesOptions, "state" | "trayReelIds">) {
  return options.trayReelIds.filter((reelId) =>
    (options.state.expectedMediaIdsByReel.get(reelId) ?? []).some(
      (mediaPk) => !options.state.cachedItems.has(mediaPk),
    ),
  );
}

async function cacheSuccessfulResponse(
  reels: ReturnType<typeof extractReels>,
  idChunk: string[],
  logger: Logger,
  state: FetchState,
  storyStorage: StoryStorage,
): Promise<number> {
  const fetchedBefore = state.fetchedMediaPks.size;
  await cacheReturnedReels(reels, state.cachedItems, state.fetchedMediaPks, storyStorage);
  addFailuresForPendingReelStories(
    idChunk,
    state,
    logger,
    createMissingResponseFailure(),
    "missing_from_response",
  );

  return state.fetchedMediaPks.size - fetchedBefore;
}

async function fetchSingleReel(
  reelId: string,
  reelIdsToFetch: string[],
  reelIndex: number,
  options: FetchMissingStoriesOptions,
): Promise<"continue" | "stop"> {
  logStoryProgress(options.logger, options.state, `fetching reel ${reelId}`);
  const singleResult = await requestWithRetry(
    () => options.client.getReelsMedia([reelId]),
    options.retryOptions,
    `reels media request for reel ${reelId}`,
  );

  if (singleResult.ok) {
    await cacheReturnedReels(
      extractReels(singleResult.value),
      options.state.cachedItems,
      options.state.fetchedMediaPks,
      options.storyStorage,
    );
    addFailuresForPendingReelStories(
      [reelId],
      options.state,
      options.logger,
      createMissingResponseFailure(),
      "missing_from_response",
    );
    logStoryProgress(options.logger, options.state, `reel ${reelId} cached`);
    return "continue";
  }

  if (singleResult.failure.reason === "rate_limited") {
    addFailuresForPendingReelStories(
      getRemainingReelIds(reelIdsToFetch, reelIndex),
      options.state,
      options.logger,
      singleResult.failure,
      "rate_limited",
    );
    logStoryProgress(options.logger, options.state, `rate limited reel ${reelId}`);
    return "stop";
  }

  options.logger.warn(`individual reel ${reelId} failed: ${singleResult.failure.message}`);
  addFailuresForPendingReelStories([reelId], options.state, options.logger, singleResult.failure);
  logStoryProgress(options.logger, options.state, `reel ${reelId} failed`);
  return "continue";
}

async function fetchSingleReelsAfterChunkFailure(
  idChunk: string[],
  reelIdsToFetch: string[],
  reelIndex: number,
  options: FetchMissingStoriesOptions,
): Promise<{ reelIndex: number; stopped: boolean }> {
  let nextReelIndex = reelIndex;

  for (const reelId of idChunk) {
    const result = await fetchSingleReel(reelId, reelIdsToFetch, nextReelIndex, options);

    if (result === "stop") {
      return { reelIndex: nextReelIndex, stopped: true };
    }

    nextReelIndex += 1;
  }

  return { reelIndex: nextReelIndex, stopped: false };
}

function handleChunkRateLimit(
  chunkIndex: number,
  reelIdsToFetch: string[],
  reelIndex: number,
  options: FetchMissingStoriesOptions,
  failure: RequestFailure,
): void {
  options.logger.warn(
    `rate limited while fetching chunk ${chunkIndex + 1}; marking remaining missing stories as rate_limited`,
  );
  addFailuresForPendingReelStories(
    getRemainingReelIds(reelIdsToFetch, reelIndex),
    options.state,
    options.logger,
    failure,
    "rate_limited",
  );
  logStoryProgress(options.logger, options.state, `rate limited chunk ${chunkIndex + 1}`);
}

async function fetchReelChunk(
  idChunk: string[],
  chunkIndex: number,
  reelChunksLength: number,
  options: FetchMissingStoriesOptions,
): Promise<"continue" | { failure: RequestFailure }> {
  logStoryProgress(
    options.logger,
    options.state,
    `fetching reel chunk ${chunkIndex + 1}/${reelChunksLength} reels=${idChunk.length}`,
  );
  const chunkResult = await requestWithRetry(
    () => options.client.getReelsMedia(idChunk),
    options.retryOptions,
    `reels media chunk ${chunkIndex + 1}/${reelChunksLength}`,
  );

  if (!chunkResult.ok) {
    return { failure: chunkResult.failure };
  }

  const cachedCount = await cacheSuccessfulResponse(
    extractReels(chunkResult.value),
    idChunk,
    options.logger,
    options.state,
    options.storyStorage,
  );
  logStoryProgress(
    options.logger,
    options.state,
    `reel chunk ${chunkIndex + 1}/${reelChunksLength} cached ${cachedCount}`,
  );
  return "continue";
}

function handleChunkFailure(
  idChunk: string[],
  reelIdsToFetch: string[],
  reelIndex: number,
  chunkIndex: number,
  options: FetchMissingStoriesOptions,
  failure: RequestFailure,
): Promise<{ reelIndex: number; stopped: boolean }> | { reelIndex: number; stopped: boolean } {
  if (failure.reason === "rate_limited") {
    handleChunkRateLimit(chunkIndex, reelIdsToFetch, reelIndex, options, failure);
    return { reelIndex, stopped: true };
  }

  options.logger.warn(`chunk ${chunkIndex + 1} failed; falling back to individual reel requests`);
  return fetchSingleReelsAfterChunkFailure(idChunk, reelIdsToFetch, reelIndex, options);
}

export async function fetchMissingStories(options: FetchMissingStoriesOptions): Promise<void> {
  const reelIdsToFetch = getReelIdsToFetch(options);

  if (reelIdsToFetch.length === 0) {
    options.logger.info("all expected stories were found in cache");
    return;
  }

  options.logger.info(`fetching missing stories from ${reelIdsToFetch.length} reel(s)`);
  let reelIndex = 0;
  const reelChunks = chunk(reelIdsToFetch, options.reelIdsPerRequest);

  for (const [chunkIndex, idChunk] of reelChunks.entries()) {
    const result = await fetchReelChunk(idChunk, chunkIndex, reelChunks.length, options);
    const next =
      result === "continue"
        ? { reelIndex: reelIndex + idChunk.length, stopped: false }
        : await handleChunkFailure(
            idChunk,
            reelIdsToFetch,
            reelIndex,
            chunkIndex,
            options,
            result.failure,
          );
    reelIndex = next.reelIndex;

    if (next.stopped) {
      break;
    }
  }
}
