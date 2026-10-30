import type { StoryRepository } from "./repositories/story-repository.ts";
import type { FetchState } from "./story-failure-service.ts";

export function preloadStoredStories(
  state: FetchState,
  storyRepository: Pick<StoryRepository, "findByMediaPk">,
) {
  for (const mediaPk of new Set(state.expectedMediaPks)) {
    const stored = storyRepository.findByMediaPk(mediaPk);

    if (stored) {
      state.cachedItems.set(mediaPk, stored);
      state.cacheHitPks.add(mediaPk);
    }
  }

  return {
    hitCount: state.cacheHitPks.size,
    missCount: state.expectedMediaPks.filter((mediaPk) => !state.cacheHitPks.has(mediaPk)).length,
  };
}
