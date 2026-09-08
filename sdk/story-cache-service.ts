import type { StoryRepository } from "./entities/story.ts";
import { getMediaCacheKey } from "./lib/cache-service.ts";
import type { StoryItem, StoryReel, StoryStorage } from "./lib/types.ts";

export async function storeReturnedReels(
  reels: Record<string, StoryReel>,
  cachedItems: Map<string, StoryItem>,
  fetchedMediaPks: Set<string>,
  storage: StoryStorage,
  storyRepository: Pick<StoryRepository, "save">,
): Promise<void> {
  for (const reel of Object.values(reels)) {
    for (const item of reel.items ?? []) {
      if (!item.pk || cachedItems.has(item.pk)) {
        continue;
      }

      // oxlint-disable-next-line no-await-in-loop -- Persist cache data before its matching database record.
      await storage.setItem(getMediaCacheKey(item.pk), item);
      // oxlint-disable-next-line no-await-in-loop -- Persist each database record before exposing the item as cached.
      await storyRepository.save(item, reel.user);
      cachedItems.set(item.pk, item);
      fetchedMediaPks.add(item.pk);
    }
  }
}
