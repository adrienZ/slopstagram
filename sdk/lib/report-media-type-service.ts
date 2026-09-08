import { storyRepository } from "./entity-repository-service.ts";
import type { StoryRepository } from "../entities/story.ts";
import { STORY_MEDIA_TYPES, type StoriesManifestReport, type StoryMediaType } from "./types.ts";

function formatStoryMediaType(
  value: StoryMediaType | number | null | undefined,
): StoryMediaType | null {
  if (value === STORY_MEDIA_TYPES.IMAGE || value === STORY_MEDIA_TYPES.VIDEO) {
    return value;
  }

  if (value === 1) {
    return STORY_MEDIA_TYPES.IMAGE;
  }
  if (value === 2) {
    return STORY_MEDIA_TYPES.VIDEO;
  }

  return null;
}

function getStoredStoryMediaType(
  mediaPk: string,
  repository: Pick<StoryRepository, "findByMediaPk">,
): StoryMediaType | null {
  const story = repository.findByMediaPk(mediaPk);
  if (story === null) {
    return null;
  }
  return formatStoryMediaType(story.media_type);
}

export function backfillReportStoryMediaTypes(
  report: StoriesManifestReport,
  repository: Pick<StoryRepository, "findByMediaPk"> = storyRepository,
): void {
  const mediaTypeByPk = new Map<string, StoryMediaType>();
  const manifestStoriesWithoutMediaType: Array<
    (typeof report.manifest.users)[number]["stories"][number]
  > = [];

  for (const user of report.manifest.users) {
    for (const story of user.stories) {
      const manifestMediaType = formatStoryMediaType(story.media_type);

      if (manifestMediaType) {
        mediaTypeByPk.set(story.media_pk, manifestMediaType);
        story.media_type = manifestMediaType;
        continue;
      }

      manifestStoriesWithoutMediaType.push(story);
    }
  }

  const manifestMediaTypes = manifestStoriesWithoutMediaType.map((story) => ({
    mediaType: getStoredStoryMediaType(story.media_pk, repository),
    story,
  }));
  for (const { mediaType, story } of manifestMediaTypes) {
    if (mediaType) {
      mediaTypeByPk.set(story.media_pk, mediaType);
      story.media_type = mediaType;
    }
  }

  const outputStoriesWithoutMediaType: Array<
    (typeof report.output.users)[number]["stories"][number]
  > = [];
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

      outputStoriesWithoutMediaType.push(story);
    }
  }

  const outputMediaTypes = outputStoriesWithoutMediaType.map((story) => ({
    mediaType: getStoredStoryMediaType(story.media_pk, repository),
    story,
  }));
  for (const { mediaType, story } of outputMediaTypes) {
    story.media_type = mediaType;
    if (mediaType) {
      mediaTypeByPk.set(story.media_pk, mediaType);
    }
  }
}
