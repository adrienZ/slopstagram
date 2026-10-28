import { z } from "zod";
import type { StoryAudio } from "./entities/story-audio.ts";
import { dashAudioSource } from "./lib/dash-audio.ts";
import { isJsonObject } from "./lib/json-value.ts";
import type { StoryAnnotations, StoryItem } from "./lib/types.ts";

const SharedReelSchema = z.object({ product_type: z.literal("clips") });

function isReelShare(story: StoryItem) {
  return (
    story.product_type === "clips" ||
    (Array.isArray(story.story_feed_media) &&
      story.story_feed_media.some((media) => SharedReelSchema.safeParse(media).success))
  );
}

function isMuted(story: StoryItem) {
  return (
    story.has_audio === false ||
    (Array.isArray(story.story_music_stickers) &&
      story.story_music_stickers.some(
        (sticker) =>
          isJsonObject(sticker) &&
          isJsonObject(sticker.music_asset_info) &&
          sticker.music_asset_info.should_mute_audio === true,
      ))
  );
}

export function planStoryAudio(
  story: StoryItem,
  annotations: StoryAnnotations,
  previous: StoryAudio | undefined,
) {
  const hasMusic =
    annotations.stickers.some(({ kind }) => kind === "music") ||
    (annotations.musicObservations?.length ?? 0) > 0;
  if (isMuted(story) || !hasMusic || isReelShare(story)) {
    return null;
  }
  const xml = story.video_dash_manifest;
  const source = xml === undefined || xml === null ? null : dashAudioSource(xml);
  if (source === null) {
    return previous ?? null;
  }
  let state: StoryAudio["state"] = "pending";
  if (previous !== undefined && previous.cachePath !== null) {
    state = "available";
  } else if (source.sourceUrl === previous?.sourceUrl) {
    const { state: previousState } = previous;
    state = previousState;
  }
  return {
    mediaPk: story.pk,
    ...source,
    cachePath: previous?.cachePath ?? null,
    durationMs: previous?.durationMs ?? null,
    state,
  };
}
