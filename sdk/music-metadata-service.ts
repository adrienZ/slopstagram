import { randomUUID } from "node:crypto";
import type {
  MusicMediaState,
  metadataMusic,
  partialMetadataMusic,
  MusicFields,
  StoryMusicObservation,
} from "./entities/music-metadata.ts";
import type { StoryAnnotations, StoryItem } from "./lib/types.ts";
import { getMusicSourceUpdate, type MusicObservationInput } from "./music-observation-service.ts";

function mergeFields(previous: MusicFields | undefined, incoming: MusicFields): MusicFields {
  const known = previous ?? incoming;
  return {
    instagramAudioAssetId: incoming.instagramAudioAssetId ?? known.instagramAudioAssetId,
    title: incoming.title ?? known.title,
    artist: incoming.artist ?? known.artist,
    durationMs: incoming.durationMs ?? known.durationMs,
    audioSourceUrl: incoming.audioSourceUrl ?? known.audioSourceUrl,
    artworkSourceUrl: incoming.artworkSourceUrl ?? known.artworkSourceUrl,
  };
}

function mediaState(
  cachePath: string | null,
  source: string | null,
  knownSource: string | null | undefined,
  knownState: MusicMediaState | undefined,
): MusicMediaState {
  if (cachePath !== null) {
    return "available";
  }
  if (source === null) {
    return "unavailable";
  }
  return source === knownSource ? (knownState ?? "pending") : "pending";
}

function retainedMedia(
  known: typeof partialMetadataMusic.$inferSelect | undefined,
  previous: StoryMusicObservation | undefined,
  fields: MusicFields,
) {
  const audioCachePath = known?.audioCachePath ?? previous?.metadata.audioCachePath ?? null;
  const artworkCachePath = known?.artworkCachePath ?? previous?.metadata.artworkCachePath ?? null;
  const prior = known ?? previous?.metadata;
  return {
    audioCachePath,
    artworkCachePath,
    audioState: mediaState(
      audioCachePath,
      fields.audioSourceUrl,
      prior?.audioSourceUrl,
      prior?.audioState,
    ),
    artworkState: mediaState(
      artworkCachePath,
      fields.artworkSourceUrl,
      prior?.artworkSourceUrl,
      prior?.artworkState,
    ),
  };
}

export function planMusicMetadataWrite(
  observation: MusicObservationInput,
  knownAssets: {
    usable: typeof metadataMusic.$inferSelect | undefined;
    partial: typeof partialMetadataMusic.$inferSelect | undefined;
  },
  previous?: StoryMusicObservation,
) {
  const { usable, partial } = knownAssets;
  const known = usable ?? partial ?? previous?.metadata;
  const fields = mergeFields(
    mergeFields(previous?.metadata, known ?? observation.fields),
    observation.fields,
  );
  const entry = {
    ...fields,
    id: known?.id ?? randomUUID(),
    ...retainedMedia(known, previous, fields),
  };
  if (fields.instagramAudioAssetId !== null && fields.title !== null && fields.artist !== null) {
    const promotedPartialIds = new Set<string>();
    if (partial !== undefined) {
      promotedPartialIds.add(partial.id);
    }
    if (previous?.metadata.status === "partial") {
      promotedPartialIds.add(previous.metadata.id);
    }
    return {
      status: "usable" as const,
      entry: {
        ...entry,
        instagramAudioAssetId: fields.instagramAudioAssetId,
        title: fields.title,
        artist: fields.artist,
      },
      promotedPartialIds: [...promotedPartialIds],
    };
  }
  return { status: "partial" as const, entry, promotedPartialIds: [] };
}

function compatibleAsset(previous: StoryMusicObservation | undefined, fields: MusicFields) {
  if (previous === undefined) {
    return previous;
  }
  const knownId = previous.metadata.instagramAudioAssetId;
  return knownId === null ||
    fields.instagramAudioAssetId === null ||
    knownId === fields.instagramAudioAssetId
    ? previous
    : undefined;
}

export function planStoryMusicUpdates(
  story: StoryItem,
  annotations: StoryAnnotations,
  previous: Array<StoryMusicObservation>,
) {
  const observations = getMusicSourceUpdate(story);
  if (observations === null) {
    return { writes: [], removedObservationIds: [] };
  }
  const stickers = annotations.stickers.filter(
    (entry) => entry.kind === "music" && entry.source === "story_music_stickers",
  );
  const labeledCount = observations.filter(({ fields }) => fields.title !== null).length;
  const incoming = labeledCount === 0 ? [] : stickers.slice(-labeledCount);
  const retained = new Set<string>();
  let labeledIndex = 0;
  const writes = observations.map((observation, sortOrder) => {
    const { providerOccurrenceId, fields } = observation;
    const uniqueProvider =
      providerOccurrenceId !== null &&
      observations.filter((entry) => entry.providerOccurrenceId === providerOccurrenceId).length ===
        1;
    const matches = uniqueProvider
      ? stickers.filter((entry) => entry.providerOccurrenceId === providerOccurrenceId)
      : [];
    let sticker = matches.length === 1 ? matches[0] : undefined;
    if (sticker === undefined && story.annotations === undefined && fields.title !== null) {
      sticker = incoming[labeledIndex];
    }
    if (fields.title !== null) {
      labeledIndex += 1;
    }
    const candidates = previous.filter(
      (entry) =>
        (uniqueProvider && entry.providerOccurrenceId === providerOccurrenceId) ||
        (sticker?.occurrenceId !== undefined && entry.occurrenceId === sticker.occurrenceId),
    );
    const old =
      candidates.length === 1 && !retained.has(candidates[0].id) ? candidates[0] : undefined;
    const id = old?.id ?? randomUUID();
    retained.add(id);
    return {
      entry: {
        id,
        mediaPk: story.pk,
        source: "story_music_stickers",
        sortOrder,
        providerOccurrenceId,
        occurrenceId: sticker?.occurrenceId ?? old?.occurrenceId ?? null,
      },
      observation,
      previous: compatibleAsset(old, fields),
    };
  });
  const complete = observations.every(({ fields }) => fields.title !== null);
  return {
    writes,
    removedObservationIds: complete
      ? previous.filter(({ id }) => !retained.has(id)).map(({ id }) => id)
      : [],
  };
}
