import type { DrizzleDatabase } from "./database/client.ts";
import { z } from "zod";
import { JsonValueSchema } from "./lib/json-value.ts";
import { getMusicObservation } from "./music-observation-service.ts";
import {
  fillMissingMusicMediaSources,
  findMusicByAudioId,
  hasStoredStory,
  readMusicObservations,
} from "./repositories/music-metadata-repository.ts";

export const CachedMusicStorySchema = z.object({
  pk: z.string(),
  story_music_stickers: z.array(JsonValueSchema).nullish(),
});
type CachedMusicStory = z.infer<typeof CachedMusicStorySchema>;

// Deliberately enrich sources only: never replay saves or rebuild occurrence links from old cache.
export function enrichMusicMediaFromCache(database: DrizzleDatabase, story: CachedMusicStory) {
  const result = { enriched: 0, skipped: 0, uncertain: 0 };
  if (
    !hasStoredStory(database, story.pk) ||
    story.story_music_stickers === undefined ||
    story.story_music_stickers === null
  ) {
    result.skipped += 1;
    return result;
  }
  const mediaPk = story.pk;
  const inputs = story.story_music_stickers
    .map(getMusicObservation)
    .filter((entry) => entry !== null);
  database.transaction((transaction) => {
    const observations = readMusicObservations(transaction, mediaPk);
    for (const input of inputs) {
      if (input.fields.audioSourceUrl === null && input.fields.artworkSourceUrl === null) {
        continue;
      }
      const exact =
        input.fields.instagramAudioAssetId === null
          ? null
          : findMusicByAudioId(transaction, input.fields.instagramAudioAssetId);
      const candidates =
        input.providerOccurrenceId === null ||
        inputs.filter((entry) => entry.providerOccurrenceId === input.providerOccurrenceId)
          .length !== 1
          ? []
          : observations.filter(
              (entry) =>
                entry.providerOccurrenceId === input.providerOccurrenceId &&
                (input.fields.instagramAudioAssetId === null ||
                  entry.metadata.instagramAudioAssetId === null ||
                  entry.metadata.instagramAudioAssetId === input.fields.instagramAudioAssetId),
            );
      const reference = exact ?? (candidates.length === 1 ? candidates[0].metadata : null);
      if (reference === null) {
        result.uncertain += 1;
        continue;
      }
      if (fillMissingMusicMediaSources(transaction, reference, input.fields)) {
        result.enriched += 1;
      } else {
        result.skipped += 1;
      }
    }
  });
  return result;
}
