import type { Logger } from "./lib/logging-service.ts";
import type {
  StoryFetchFailure,
  StoryFetchFailureReason,
  StoryItem,
  StoryTrayEntry,
} from "./lib/types.ts";
import type { RequestFailure } from "./story-retry-service.ts";

export type FetchState = {
  cachedItems: Map<string, StoryItem>;
  cacheHitPks: Set<string>;
  expectedMediaIdsByReel: Map<string, string[]>;
  expectedMediaPks: string[];
  failureByMediaPk: Map<string, number>;
  failures: StoryFetchFailure[];
  fetchedMediaPks: Set<string>;
};

export function createFetchState(tray: StoryTrayEntry[]): FetchState {
  return {
    cachedItems: new Map(),
    cacheHitPks: new Set(),
    expectedMediaIdsByReel: new Map(tray.map((entry) => [entry.id, entry.media_ids])),
    expectedMediaPks: tray.flatMap((entry) => entry.media_ids),
    failureByMediaPk: new Map(),
    failures: [],
    fetchedMediaPks: new Set(),
  };
}

function createFailure(
  reelId: string,
  mediaPk: string | null,
  failure: RequestFailure,
  reason: StoryFetchFailureReason = failure.reason,
): StoryFetchFailure {
  return {
    attempt_count: failure.attemptCount,
    http_status: failure.status,
    media_pk: mediaPk,
    message: failure.message,
    reason,
    reel_id: reelId,
  };
}

function getPendingMediaIds(
  reelId: string,
  expectedMediaIdsByReel: Map<string, string[]>,
  cachedItems: Map<string, StoryItem>,
): string[] {
  return (expectedMediaIdsByReel.get(reelId) ?? []).filter((mediaPk) => !cachedItems.has(mediaPk));
}

export function addFailuresForPendingReelStories(
  reelIds: string[],
  state: FetchState,
  logger: Logger,
  failure: RequestFailure,
  reason: StoryFetchFailureReason = failure.reason,
): void {
  for (const reelId of reelIds) {
    for (const mediaPk of getPendingMediaIds(
      reelId,
      state.expectedMediaIdsByReel,
      state.cachedItems,
    )) {
      if (state.failureByMediaPk.has(mediaPk)) {
        continue;
      }

      const failureIndex = state.failures.length;
      const storyFailure = createFailure(reelId, mediaPk, failure, reason);
      state.failures.push(storyFailure);
      state.failureByMediaPk.set(mediaPk, failureIndex);
      logger.error(
        `story failed: reel_id=${storyFailure.reel_id} media_pk=${storyFailure.media_pk} reason=${storyFailure.reason} status=${storyFailure.http_status ?? "none"} attempts=${storyFailure.attempt_count} message=${storyFailure.message}`,
      );
    }
  }
}

function getResolvedStoryCount(state: FetchState): number {
  return state.cacheHitPks.size + state.fetchedMediaPks.size + state.failureByMediaPk.size;
}

export function logStoryProgress(logger: Logger, state: FetchState, suffix: string): void {
  logger.progress(getResolvedStoryCount(state), state.expectedMediaPks.length, {
    prefix: "stories",
    suffix,
  });
}

export function getRemainingReelIds(reelIdsToFetch: string[], currentIndex: number): string[] {
  return reelIdsToFetch.slice(currentIndex);
}

export function createMissingResponseFailure(): RequestFailure {
  return {
    attemptCount: 1,
    message: "Expected story was missing from Instagram reels response",
    reason: "request_failed",
    status: null,
  };
}
