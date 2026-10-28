import { z } from "zod";
import { isJsonObject, JsonValueSchema } from "./lib/json-value.ts";
import type { StoryItem, InstagramClient } from "./instagram-types.ts";
import type { Logger } from "./lib/logging-service.ts";
import type { StoryRepository } from "./repositories/story-repository.ts";
import { getMusicObservation } from "./music-observation-service.ts";

type MusicAssetRepository = Pick<StoryRepository, "findByMediaPk"> &
  Partial<Pick<StoryRepository, "refreshMusicAsset">>;

const metadataSchema = z.object({
  music_info: z.object({ music_asset_info: JsonValueSchema.optional() }).nullish(),
});
const responseSchema = z.object({
  metadata: metadataSchema.nullish(),
  payload: z.object({ metadata: metadataSchema.nullish() }).nullish(),
});

function skipStory(story: StoryItem) {
  return (
    story.has_audio === false ||
    story.product_type === "clips" ||
    (Array.isArray(story.story_feed_media) &&
      story.story_feed_media.some(
        (media) => z.object({ product_type: z.literal("clips") }).safeParse(media).success,
      )) ||
    (Array.isArray(story.story_music_stickers) &&
      story.story_music_stickers.some(
        (sticker) =>
          isJsonObject(sticker) &&
          isJsonObject(sticker.music_asset_info) &&
          sticker.music_asset_info.should_mute_audio === true,
      ))
  );
}

async function lookupAsset(
  getMusicAsset: NonNullable<InstagramClient["getMusicAsset"]>,
  audioId: string,
  logger: Pick<Logger, "warn">,
) {
  try {
    const response = await getMusicAsset(audioId);
    if (response.status === 429 || response.status === 401 || response.status === 403) {
      logger.warn(`music asset lookup stopped after Instagram HTTP ${response.status}`);
      return "stop" as const;
    }
    if (!response.ok) {
      return null;
    }
    const parsed = responseSchema.safeParse(response.json());
    const info = parsed.success
      ? (parsed.data.metadata ?? parsed.data.payload?.metadata)?.music_info?.music_asset_info
      : undefined;
    if (info === undefined || (isJsonObject(info) && info.should_mute_audio === true)) {
      return null;
    }
    const received = getMusicObservation({ music_asset_info: info });
    return received?.fields.instagramAudioAssetId === audioId ? received : null;
  } catch {
    logger.warn("music asset lookup failed; continuing story ingestion");
    return null;
  }
}

export async function enrichCurrentMusicAssets(
  client: Pick<InstagramClient, "getMusicAsset">,
  stories: Iterable<StoryItem>,
  repository: MusicAssetRepository | undefined,
  logger: Pick<Logger, "warn">,
) {
  if (client.getMusicAsset === undefined || repository?.refreshMusicAsset === undefined) {
    return;
  }
  const seen = new Set<string>();
  for (const story of stories) {
    if (skipStory(story)) {
      continue;
    }
    const current = repository.findByMediaPk(story.pk);
    for (const observation of current?.annotations?.musicObservations ?? []) {
      const { metadata } = observation;
      const audioId = metadata.instagramAudioAssetId;
      if (
        audioId === null ||
        seen.has(audioId) ||
        (metadata.audioCachePath !== null && metadata.artworkCachePath !== null)
      ) {
        continue;
      }
      seen.add(audioId);
      // oxlint-disable-next-line no-await-in-loop -- Keep requests sequential and stop on rate limits.
      const received = await lookupAsset(client.getMusicAsset, audioId, logger);
      if (received === "stop") {
        return;
      }
      if (received !== null) {
        repository.refreshMusicAsset(story.pk, observation.id, received);
      }
    }
  }
}
