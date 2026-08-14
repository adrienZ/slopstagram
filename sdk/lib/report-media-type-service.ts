import { storiesStorage } from "./cache-service.ts";
import { StoryItemSchema } from "./story-schemas.ts";
import {
  STORY_MEDIA_TYPES,
  type StoriesManifestReport,
  type StoryMediaType,
  type StoryStorage,
} from "./types.ts";

function formatStoryMediaType(value: unknown): StoryMediaType | null {
  if (value === STORY_MEDIA_TYPES.IMAGE || value === STORY_MEDIA_TYPES.VIDEO) {
    return value;
  }

  if (value === 1) return STORY_MEDIA_TYPES.IMAGE;
  if (value === 2) return STORY_MEDIA_TYPES.VIDEO;

  return null;
}

async function getCachedStoryMediaType(
  cacheKey: string,
  storage: StoryStorage,
): Promise<StoryMediaType | null> {
  const cachedStory = await storage.getItem(cacheKey);

  if (cachedStory === null || cachedStory === undefined) return null;

  const result = StoryItemSchema.safeParse(
    typeof cachedStory === "string" ? JSON.parse(cachedStory) : cachedStory,
  );

  if (!result.success) {
    return null;
  }

  const story = result.data;

  return formatStoryMediaType(story.media_type);
}

export async function backfillReportStoryMediaTypes(
  report: StoriesManifestReport,
  storage: StoryStorage = storiesStorage,
): Promise<void> {
  const mediaTypeByPk = new Map<string, StoryMediaType>();

  for (const user of report.manifest.users) {
    for (const story of user.stories) {
      const manifestMediaType = formatStoryMediaType(story.media_type);

      if (manifestMediaType) {
        mediaTypeByPk.set(story.media_pk, manifestMediaType);
        story.media_type = manifestMediaType;
        continue;
      }

      const cachedMediaType = await getCachedStoryMediaType(`${story.media_pk}.json`, storage);
      if (cachedMediaType) {
        mediaTypeByPk.set(story.media_pk, cachedMediaType);
        story.media_type = cachedMediaType;
      }
    }
  }

  for (const user of report.output.users) {
    for (const story of user.stories) {
      const outputMediaType = formatStoryMediaType(story.media_type);
      if (outputMediaType) {
        story.media_type = outputMediaType;
        mediaTypeByPk.set(story.media_pk, outputMediaType);
        continue;
      }

      const knownMediaType = mediaTypeByPk.get(story.media_pk);
      if (knownMediaType) {
        story.media_type = knownMediaType;
        continue;
      }

      const cachedMediaType = await getCachedStoryMediaType(`${story.media_pk}.json`, storage);
      story.media_type = cachedMediaType;
      if (cachedMediaType) mediaTypeByPk.set(story.media_pk, cachedMediaType);
    }
  }
}
