import { createHash } from "node:crypto";
import type { StorySticker } from "./entities/story.ts";
import type { StoryItem } from "./lib/types.ts";
import { getLocationSourceUpdates } from "./location-observation-service.ts";
import { getMusicSourceUpdate } from "./music-observation-service.ts";
import { getStoryAnnotationUpdates } from "./story-sticker-location-service.ts";

interface CachedObservation {
  providerOccurrenceId: string | null;
  fields: object;
}

interface StoredObservation {
  id: string;
  providerOccurrenceId: string | null;
  occurrenceId: string | null;
}

// Replay keys identify cached evidence, not historical sticker occurrences.
// Only the ordinal among byte-identical parsed evidence distinguishes duplicates;
// moving a different observation in the array cannot change their keys.
export function planCachedObservations<
  T extends CachedObservation,
  P extends StoredObservation & { metadata: T["fields"] },
>(
  mediaPk: string,
  source: string,
  kind: string,
  observations: Array<T>,
  previous: Array<P>,
  stickers: Array<StorySticker>,
  sharedIdentity: (fields: T["fields"]) => string | null,
) {
  const duplicates = new Map<string, number>();
  return observations.map((observation) => {
    const evidence = JSON.stringify(observation);
    const duplicate = duplicates.get(evidence) ?? 0;
    duplicates.set(evidence, duplicate + 1);
    const replayId = `cache:${createHash("sha256")
      .update(JSON.stringify([mediaPk, source, evidence, duplicate]))
      .digest("hex")}`;
    const provider = observation.providerOccurrenceId;
    const unique =
      provider !== null &&
      observations.filter((entry) => entry.providerOccurrenceId === provider).length === 1;
    const candidates = previous.filter((entry) => entry.providerOccurrenceId === provider);
    const replayed = previous.find(({ id }) => id === replayId);
    const old = replayed ?? (unique && candidates.length === 1 ? candidates[0] : undefined);
    const matches = unique
      ? stickers.filter(
          (entry) =>
            entry.kind === kind &&
            entry.source === source &&
            entry.providerOccurrenceId === provider,
        )
      : [];
    const occurrenceId =
      old?.occurrenceId ?? (matches.length === 1 ? (matches[0].occurrenceId ?? null) : null);
    const incomingId = sharedIdentity(observation.fields);
    const knownId = old === undefined ? null : sharedIdentity(old.metadata);
    // Without unique provider evidence, existing live observations cannot safely
    // be equated with the cache. Preserve them and report the unresolved input.
    const ambiguous = old === undefined && candidates.length > 0;
    const conflicting = incomingId !== null && knownId !== null && incomingId !== knownId;
    return {
      observation,
      previous: old,
      id: old?.id ?? replayId,
      occurrenceId,
      skip: ambiguous || conflicting,
    };
  });
}

export function getCachedMetadataUpdates(story: StoryItem) {
  const malformed = new Set<string>();
  getStoryAnnotationUpdates(story, (source) => {
    malformed.add(source);
  });
  const locations = getLocationSourceUpdates(story).filter(({ source }) => !malformed.has(source));
  const music = getMusicSourceUpdate(story);
  let invalid = 0;
  for (const source of ["story_locations", "story_bloks_stickers"] as const) {
    if (
      story[source] !== undefined &&
      story[source] !== null &&
      !locations.some((entry) => entry.source === source)
    ) {
      invalid += 1;
    }
  }
  if (
    story.story_music_stickers !== undefined &&
    story.story_music_stickers !== null &&
    music === null
  ) {
    invalid += 1;
  }
  return { locations, music: music ?? [], invalid };
}
