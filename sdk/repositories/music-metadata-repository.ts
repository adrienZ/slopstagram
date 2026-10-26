import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { stories } from "../entities/story.ts";
import type { DrizzleDatabase } from "../database/client.ts";
import {
  metadataMusic,
  partialMetadataMusic,
  storyMusicObservations,
  type MusicFields,
  type MusicMetadata,
  type MusicMetadataReference,
  type MusicMediaState,
  type StoryMusicObservation,
} from "../entities/music-metadata.ts";
import type { StoryAnnotations, StoryItem } from "../lib/types.ts";
import type { MusicObservationInput } from "../music-observation-service.ts";
import { planMusicMetadataWrite, planStoryMusicUpdates } from "../music-metadata-service.ts";

type MusicDatabase = Pick<DrizzleDatabase, "select" | "insert" | "update" | "delete">;

export function readMusicObservations(
  database: MusicDatabase,
  mediaPk: string,
): Array<StoryMusicObservation> {
  const rows = database
    .select()
    .from(storyMusicObservations)
    .leftJoin(metadataMusic, eq(storyMusicObservations.musicId, metadataMusic.id))
    .leftJoin(
      partialMetadataMusic,
      eq(storyMusicObservations.partialMusicId, partialMetadataMusic.id),
    )
    .where(eq(storyMusicObservations.mediaPk, mediaPk))
    .orderBy(asc(storyMusicObservations.sortOrder))
    .all();
  return rows.flatMap(
    ({
      story_music_observations: observation,
      metadata_music: music,
      metadata_music_partial: partial,
    }) => {
      let metadata: MusicMetadata | null = null;
      if (music !== null) {
        metadata = { ...music, status: "usable" };
      } else if (partial !== null) {
        metadata = { ...partial, status: "partial" };
      }
      return metadata
        ? [
            {
              id: observation.id,
              source: observation.source,
              providerOccurrenceId: observation.providerOccurrenceId,
              occurrenceId: observation.occurrenceId,
              metadata,
            },
          ]
        : [];
    },
  );
}

function saveMetadata(
  database: MusicDatabase,
  observation: MusicObservationInput,
  previous?: StoryMusicObservation,
) {
  const audioId =
    observation.fields.instagramAudioAssetId ?? previous?.metadata.instagramAudioAssetId ?? null;
  const usable =
    audioId === null
      ? undefined
      : database
          .select()
          .from(metadataMusic)
          .where(eq(metadataMusic.instagramAudioAssetId, audioId))
          .get();
  const partial =
    audioId === null
      ? undefined
      : database
          .select()
          .from(partialMetadataMusic)
          .where(eq(partialMetadataMusic.instagramAudioAssetId, audioId))
          .get();
  const plan = planMusicMetadataWrite(observation, { usable, partial }, previous);
  if (plan.status === "usable") {
    database
      .insert(metadataMusic)
      .values(plan.entry)
      .onConflictDoUpdate({ target: metadataMusic.id, set: plan.entry })
      .run();
    for (const partialId of plan.promotedPartialIds) {
      database
        .update(storyMusicObservations)
        .set({ musicId: plan.entry.id, partialMusicId: null })
        .where(eq(storyMusicObservations.partialMusicId, partialId))
        .run();
      database.delete(partialMetadataMusic).where(eq(partialMetadataMusic.id, partialId)).run();
    }
    return { musicId: plan.entry.id, partialMusicId: null };
  }
  database
    .insert(partialMetadataMusic)
    .values(plan.entry)
    .onConflictDoUpdate({ target: partialMetadataMusic.id, set: plan.entry })
    .run();
  return { musicId: null, partialMusicId: plan.entry.id };
}

export function enrichStoryMusic(
  database: MusicDatabase,
  story: StoryItem,
  annotations: StoryAnnotations,
) {
  const plan = planStoryMusicUpdates(story, annotations, readMusicObservations(database, story.pk));
  for (const write of plan.writes) {
    const metadata = saveMetadata(database, write.observation, write.previous);
    const entry = { ...write.entry, ...metadata };
    database
      .insert(storyMusicObservations)
      .values(entry)
      .onConflictDoUpdate({ target: storyMusicObservations.id, set: entry })
      .run();
  }
  for (const id of plan.removedObservationIds) {
    database.delete(storyMusicObservations).where(eq(storyMusicObservations.id, id)).run();
  }
}

export function findMusicMetadata(database: MusicDatabase, reference: MusicMetadataReference) {
  const table = reference.status === "usable" ? metadataMusic : partialMetadataMusic;
  return database.select().from(table).where(eq(table.id, reference.id)).get();
}

export function listMusicMetadata(database: MusicDatabase): Array<MusicMetadataReference> {
  return [
    ...database
      .select({ id: metadataMusic.id })
      .from(metadataMusic)
      .all()
      .map((row) => ({ ...row, status: "usable" as const })),
    ...database
      .select({ id: partialMetadataMusic.id })
      .from(partialMetadataMusic)
      .all()
      .map((row) => ({ ...row, status: "partial" as const })),
  ];
}

export function saveMusicMedia(
  database: MusicDatabase,
  reference: MusicMetadataReference,
  kind: "audio" | "artwork",
  source: string | null,
  cachePath: string | null,
  state: MusicMediaState,
) {
  const table = reference.status === "usable" ? metadataMusic : partialMetadataMusic;
  const sourceColumn = kind === "audio" ? table.audioSourceUrl : table.artworkSourceUrl;
  database
    .update(table)
    .set(
      kind === "audio"
        ? { audioCachePath: cachePath, audioState: state }
        : { artworkCachePath: cachePath, artworkState: state },
    )
    .where(
      and(
        eq(table.id, reference.id),
        source === null ? isNull(sourceColumn) : eq(sourceColumn, source),
      ),
    )
    .run();
}

export function findMusicByAudioId(
  database: MusicDatabase,
  audioId: string,
): MusicMetadataReference | null {
  const usable = database
    .select({ id: metadataMusic.id })
    .from(metadataMusic)
    .where(eq(metadataMusic.instagramAudioAssetId, audioId))
    .get();
  if (usable) {
    return { ...usable, status: "usable" };
  }
  const partial = database
    .select({ id: partialMetadataMusic.id })
    .from(partialMetadataMusic)
    .where(eq(partialMetadataMusic.instagramAudioAssetId, audioId))
    .get();
  return partial ? { ...partial, status: "partial" } : null;
}

export function hasStoredStory(database: MusicDatabase, mediaPk: string) {
  return (
    database
      .select({ mediaPk: stories.mediaPk })
      .from(stories)
      .where(eq(stories.mediaPk, mediaPk))
      .get() !== undefined
  );
}

export function fillMissingMusicMediaSources(
  database: MusicDatabase,
  reference: MusicMetadataReference,
  sources: Pick<MusicFields, "audioSourceUrl" | "artworkSourceUrl">,
) {
  const table = reference.status === "usable" ? metadataMusic : partialMetadataMusic;
  const result = database
    .update(table)
    .set({
      audioSourceUrl: sql`coalesce(${table.audioSourceUrl}, ${sources.audioSourceUrl})`,
      artworkSourceUrl: sql`coalesce(${table.artworkSourceUrl}, ${sources.artworkSourceUrl})`,
      audioState: sql`CASE WHEN ${table.audioSourceUrl} IS NULL AND ${sources.audioSourceUrl} IS NOT NULL AND ${table.audioCachePath} IS NULL THEN 'pending' ELSE ${table.audioState} END`,
      artworkState: sql`CASE WHEN ${table.artworkSourceUrl} IS NULL AND ${sources.artworkSourceUrl} IS NOT NULL AND ${table.artworkCachePath} IS NULL THEN 'pending' ELSE ${table.artworkState} END`,
    })
    .where(
      and(
        eq(table.id, reference.id),
        or(
          sources.audioSourceUrl === null ? undefined : isNull(table.audioSourceUrl),
          sources.artworkSourceUrl === null ? undefined : isNull(table.artworkSourceUrl),
        ),
      ),
    )
    .run();
  return result.changes > 0;
}
