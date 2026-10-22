import type { StoryRepository } from "./repositories/story-repository.ts";
import { getMediaCacheKey } from "./lib/cache-service.ts";
import type { StoryItem, StoryReel, StoryStorage } from "./lib/types.ts";

export async function storeReturnedReels(
  reels: Record<string, StoryReel>,
  cachedItems: Map<string, StoryItem>,
  fetchedMediaPks: Set<string>,
  storage: StoryStorage,
  storyRepository: Pick<StoryRepository, "findByMediaPk" | "save">,
): Promise<void> {
  for (const reel of Object.values(reels)) {
    for (const item of reel.items ?? []) {
      if (!item.pk || cachedItems.has(item.pk)) {
        continue;
      }

      // oxlint-disable-next-line no-await-in-loop -- Persist each observation before exposing its merged annotations.
      await storyRepository.save(item, reel.user);
      const stored = storyRepository.findByMediaPk(item.pk);
      const effectiveItem = stored?.annotations
        ? { ...item, annotations: stored.annotations }
        : item;
      // oxlint-disable-next-line no-await-in-loop -- Cache the effective saved annotations for this story.
      await storage.setItem(getMediaCacheKey(item.pk), effectiveItem);
      cachedItems.set(item.pk, effectiveItem);
      fetchedMediaPks.add(item.pk);
    }
  }
}
