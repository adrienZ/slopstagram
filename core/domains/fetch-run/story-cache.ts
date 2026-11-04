import { getMediaCacheKey } from "@@/core/domains/media-store/cache-storage.ts";
import type { StoryItem, StoryReel } from "@@/core/domains/instagram/instagram-types.ts";
import type { StoryRepository } from "@@/core/database/repositories/story-repository.ts";
import type { Runtime } from "@@/core/runtime/runtime.ts";

export async function storeReturnedReels(
  {
    stories: storyRepository,
    storage,
  }: Pick<Runtime, "storage"> & { stories: Pick<StoryRepository, "findByMediaPk" | "save"> },
  reels: Record<string, StoryReel>,
  cachedItems: Map<string, StoryItem>,
  fetchedMediaPks: Set<string>,
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
      await storage.stories.setItem(getMediaCacheKey(item.pk), effectiveItem);
      cachedItems.set(item.pk, effectiveItem);
      fetchedMediaPks.add(item.pk);
    }
  }
}
