import type { Runtime } from "@@/core/runtime/runtime.ts";
import type { Logger } from "@@/core/utils/logging.ts";
import { extractReels } from "@@/core/instagram/story-client.ts";
import { storeReturnedReels } from "./story-cache.ts";
import {
  addFailuresForPendingReelStories,
  createMissingResponseFailure,
  getRemainingReelIds,
  logStoryProgress,
  type FetchState,
} from "./story-failure.ts";
import {
  chunk,
  requestWithRetry,
  type RequestFailure,
  type RetryOptions,
} from "@@/core/instagram/story-retry.ts";
import type { InstagramClient } from "@@/core/instagram/instagram-types.ts";

interface FetchMissingStoriesInput {
  client: InstagramClient;
  state: FetchState;
  trayReelIds: Array<string>;
}

interface FetchMissingStoriesOptions {
  reelIdsPerRequest: number;
  retryOptions: RetryOptions;
}

interface MissingStoriesContext
  extends
    Pick<Runtime, "logger" | "stories" | "storage">,
    FetchMissingStoriesInput,
    FetchMissingStoriesOptions {}

function getReelIdsToFetch(options: Pick<MissingStoriesContext, "state" | "trayReelIds">) {
  return options.trayReelIds.filter((reelId) =>
    (options.state.expectedMediaIdsByReel.get(reelId) ?? []).some(
      (mediaPk) => !options.state.cachedItems.has(mediaPk),
    ),
  );
}

async function cacheSuccessfulResponse(
  runtime: Pick<Runtime, "logger" | "stories" | "storage">,
  reels: ReturnType<typeof extractReels>,
  idChunk: Array<string>,
  state: FetchState,
): Promise<number> {
  const fetchedBefore = state.fetchedMediaPks.size;
  await storeReturnedReels(runtime, reels, state.cachedItems, state.fetchedMediaPks);
  addFailuresForPendingReelStories(
    idChunk,
    state,
    runtime.logger,
    createMissingResponseFailure(),
    "missing_from_response",
  );

  return state.fetchedMediaPks.size - fetchedBefore;
}

async function fetchSingleReel(
  reelId: string,
  reelIdsToFetch: Array<string>,
  reelIndex: number,
  options: MissingStoriesContext,
): Promise<"continue" | "stop"> {
  logStoryProgress(options.logger, options.state, `fetching reel ${reelId}`);
  const singleResult = await requestWithRetry(
    async () => await options.client.getReelsMedia([reelId]),
    options.retryOptions,
    `reels media request for reel ${reelId}`,
  );

  if (singleResult.ok) {
    await storeReturnedReels(
      options,
      extractReels(singleResult.value),
      options.state.cachedItems,
      options.state.fetchedMediaPks,
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
  idChunk: Array<string>,
  reelIdsToFetch: Array<string>,
  reelIndex: number,
  options: MissingStoriesContext,
): Promise<{ reelIndex: number; stopped: boolean }> {
  let nextReelIndex = reelIndex;

  for (const reelId of idChunk) {
    // oxlint-disable-next-line no-await-in-loop -- Preserve reel order and stop immediately when a rate limit is reached.
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
  reelIdsToFetch: Array<string>,
  reelIndex: number,
  options: MissingStoriesContext,
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
  idChunk: Array<string>,
  chunkIndex: number,
  reelChunksLength: number,
  options: MissingStoriesContext,
): Promise<"continue" | { failure: RequestFailure }> {
  logStoryProgress(
    options.logger,
    options.state,
    `fetching reel chunk ${chunkIndex + 1}/${reelChunksLength} reels=${idChunk.length}`,
  );
  const chunkResult = await requestWithRetry(
    async () => await options.client.getReelsMedia(idChunk),
    options.retryOptions,
    `reels media chunk ${chunkIndex + 1}/${reelChunksLength}`,
  );

  if (!chunkResult.ok) {
    return { failure: chunkResult.failure };
  }

  const cachedCount = await cacheSuccessfulResponse(
    options,
    extractReels(chunkResult.value),
    idChunk,
    options.state,
  );
  logStoryProgress(
    options.logger,
    options.state,
    `reel chunk ${chunkIndex + 1}/${reelChunksLength} cached ${cachedCount}`,
  );
  return "continue";
}

function handleChunkFailure(
  idChunk: Array<string>,
  reelIdsToFetch: Array<string>,
  reelIndex: number,
  chunkIndex: number,
  options: MissingStoriesContext,
  failure: RequestFailure,
): Promise<{ reelIndex: number; stopped: boolean }> | { reelIndex: number; stopped: boolean } {
  if (failure.reason === "rate_limited") {
    handleChunkRateLimit(chunkIndex, reelIdsToFetch, reelIndex, options, failure);
    return { reelIndex, stopped: true };
  }

  options.logger.warn(`chunk ${chunkIndex + 1} failed; falling back to individual reel requests`);
  return fetchSingleReelsAfterChunkFailure(idChunk, reelIdsToFetch, reelIndex, options);
}

export async function fetchMissingStories(
  runtime: Pick<Runtime, "logger" | "stories" | "storage">,
  input: FetchMissingStoriesInput,
  options: FetchMissingStoriesOptions,
): Promise<void> {
  const context: MissingStoriesContext = { ...runtime, ...input, ...options };
  const reelIdsToFetch = getReelIdsToFetch(context);

  if (reelIdsToFetch.length === 0) {
    context.logger.info("all expected stories were found in cache");
    return;
  }

  context.logger.info(`fetching missing stories from ${reelIdsToFetch.length} reel(s)`);
  let reelIndex = 0;
  const reelChunks = chunk(reelIdsToFetch, context.reelIdsPerRequest);

  for (const [chunkIndex, idChunk] of reelChunks.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- Process chunks in order so rate-limit handling prevents later requests.
    const result = await fetchReelChunk(idChunk, chunkIndex, reelChunks.length, context);
    const next =
      result === "continue"
        ? { reelIndex: reelIndex + idChunk.length, stopped: false }
        : // oxlint-disable-next-line no-await-in-loop -- Failure recovery updates the ordered reel position.
          await handleChunkFailure(
            idChunk,
            reelIdsToFetch,
            reelIndex,
            chunkIndex,
            context,
            result.failure,
          );
    const { reelIndex: nextReelIndex, stopped } = next;
    reelIndex = nextReelIndex;

    if (stopped) {
      break;
    }
  }
}
