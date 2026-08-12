import { getMediaCacheKey } from "./lib/cache-service.ts";
import { StoryItemSchema } from "./lib/story-schemas.ts";
import type { StoryItem, StoryReel, StoryStorage } from "./lib/types.ts";

export async function getCachedStoryItem(
  mediaPk: string,
  storyStorage: StoryStorage,
): Promise<StoryItem | null> {
  const cachedValue = await storyStorage.getItem(getMediaCacheKey(mediaPk));

  if (cachedValue === null || cachedValue === undefined) {
    return null;
  }

  const result = StoryItemSchema.safeParse(
    typeof cachedValue === "string" ? JSON.parse(cachedValue) : cachedValue,
  );

  if (!result.success) {
    return null;
  }

  const item = result.data;

  return item.pk === mediaPk ? item : null;
}

async function cacheStoryItem(item: StoryItem, storyStorage: StoryStorage): Promise<void> {
  await storyStorage.setItem(getMediaCacheKey(item.pk), item);
}

export async function cacheReturnedReels(
  reels: Record<string, StoryReel>,
  cachedItems: Map<string, StoryItem>,
  fetchedMediaPks: Set<string>,
  storyStorage: StoryStorage,
): Promise<void> {
  for (const reel of Object.values(reels)) {
    for (const item of reel.items ?? []) {
      if (!item.pk || cachedItems.has(item.pk)) {
        continue;
      }

      await cacheStoryItem(item, storyStorage);
      cachedItems.set(item.pk, item);
      fetchedMediaPks.add(item.pk);
    }
  }
}
