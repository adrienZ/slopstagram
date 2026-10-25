import { asc, eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../database/client.ts";
import {
  metadataMusic,
  partialMetadataMusic,
  storyMusicObservations,
  type MusicMetadata,
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
