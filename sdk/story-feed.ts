import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { BASE_CACHE_DIR } from "./lib/cache-service.ts";
import { storyRepository, visionRepository } from "./lib/entity-repository-service.ts";
import type { StoryRepository } from "./repositories/story-repository.ts";
import type { StoryOutputUser, UserTimelineStory, VisionResult } from "./lib/types.ts";
import { VISION_MODEL, VISION_PROMPT } from "./lib/vision-analysis-service.ts";
import type { VisionRepository } from "./entities/vision.ts";

function getMediaType(value: number | undefined): "image" | "video" | null {
  if (value === 1) {
    return "image";
  }
  return value === 2 ? "video" : null;
}

export function createStoredStoryUser(
  latestStory: UserTimelineStory,
  stories: Array<UserTimelineStory>,
): StoryOutputUser {
  return {
    full_name: latestStory.full_name,
    profile_pic_url:
      latestStory.owner_pk === null ? null : `images/avatars/${latestStory.owner_pk}.jpg`,
    reel_ids: [],
    stories: stories.map((entry) => ({
      ig_caption: entry.story.accessibility_caption ?? "",
      locations: entry.locations,
      media_type: getMediaType(entry.story.media_type),
      media_pk: entry.story.pk,
      preview_image_url: `images/story-previews/${entry.story.pk}.jpg`,
      status: "ok",
      stickers: entry.stickers,
    })),
    username: latestStory.username,
  };
}

interface StoryFeedOptions {
  repository?: Pick<StoryRepository, "listActive">;
  hasPreview?: (mediaPk: string) => boolean;
}

export function createStoryFeed(now: Date, options: StoryFeedOptions = {}): Array<StoryOutputUser> {
  const hasPreview =
    options.hasPreview ??
    ((mediaPk) =>
      existsSync(path.join(BASE_CACHE_DIR, "images", "story-previews", `${mediaPk}.jpg`)));
  const entries = (options.repository ?? storyRepository)
    .listActive(now)
    .filter((entry) => hasPreview(entry.story.pk))
    .toSorted(
      (left, right) =>
        right.taken_at - left.taken_at ||
        left.username.localeCompare(right.username) ||
        left.story.pk.localeCompare(right.story.pk),
    );
  const byUser = new Map<string, Array<UserTimelineStory>>();
  for (const entry of entries) {
    const stories = byUser.get(entry.username) ?? [];
    stories.push(entry);
    byUser.set(entry.username, stories);
  }
  return [...byUser.values()].map((stories) =>
    createStoredStoryUser(
      stories[0],
      stories.toSorted(
        (left, right) =>
          left.taken_at - right.taken_at || left.story.pk.localeCompare(right.story.pk),
      ),
    ),
  );
}

export function readStoryFeedVision(
  users: Array<StoryOutputUser>,
  repository: Pick<VisionRepository, "findByMediaPk"> = visionRepository,
): Map<string, VisionResult> {
  const visionByPreviewUrl = new Map<string, VisionResult>();
  const promptHash = createHash("sha256").update(VISION_PROMPT).digest("hex");
  for (const story of users.flatMap((user) => user.stories)) {
    const entry = repository.findByMediaPk(story.media_pk);
    if (
      story.preview_image_url !== null &&
      story.preview_image_url.length > 0 &&
      entry?.model === VISION_MODEL &&
      entry.prompt_hash === promptHash
    ) {
      visionByPreviewUrl.set(story.preview_image_url, entry.result);
    }
  }
  return visionByPreviewUrl;
}
