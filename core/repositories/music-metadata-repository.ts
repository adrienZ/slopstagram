import { and, asc, eq, isNull } from "drizzle-orm";
import type { DrizzleDatabase } from "../database/client.ts";
import {
  metadataMusic,
  storyMusicObservations,
  classifyMusic,
  type MusicMetadataReference,
  type MusicMediaState,
  type StoryMusicObservation,
} from "../entities/music-metadata.ts";
import type { StoryAnnotations } from "../story-types.ts";
import type { StoryItem } from "../instagram-types.ts";
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
    .innerJoin(metadataMusic, eq(storyMusicObservations.musicId, metadataMusic.id))
    .where(eq(storyMusicObservations.mediaPk, mediaPk))
    .orderBy(asc(storyMusicObservations.sortOrder))
    .all();
  return rows.map(({ story_music_observations: observation, metadata_music: music }) => ({
    id: observation.id,
    source: observation.source,
    providerOccurrenceId: observation.providerOccurrenceId,
    occurrenceId: observation.occurrenceId,
    metadata: classifyMusic(music),
  }));
}

function saveMetadata(
  database: MusicDatabase,
  observation: MusicObservationInput,
  previous?: StoryMusicObservation,
) {
  const identifier =
    observation.fields.instagramAudioAssetId ?? previous?.metadata.instagramAudioAssetId ?? null;
  const known =
    identifier === null
      ? undefined
      : database
          .select()
          .from(metadataMusic)
          .where(eq(metadataMusic.instagramAudioAssetId, identifier))
          .get();
  const entry = planMusicMetadataWrite(observation, known, previous);
  database
    .insert(metadataMusic)
    .values(entry)
    .onConflictDoUpdate({ target: metadataMusic.id, set: entry })
    .run();
  if (previous && previous.metadata.id !== entry.id) {
    database
      .update(storyMusicObservations)
      .set({ musicId: entry.id })
      .where(eq(storyMusicObservations.musicId, previous.metadata.id))
      .run();
    database.delete(metadataMusic).where(eq(metadataMusic.id, previous.metadata.id)).run();
  }
  return { musicId: entry.id };
}

export function refreshMusicAsset(
  database: MusicDatabase,
  previous: StoryMusicObservation,
  observation: MusicObservationInput,
) {
  if (previous.metadata.instagramAudioAssetId !== observation.fields.instagramAudioAssetId) {
    return;
  }
  saveMetadata(database, observation, previous);
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
  const table = metadataMusic;
  return database.select().from(table).where(eq(table.id, reference.id)).get();
}

export function saveMusicMedia(
  database: MusicDatabase,
  reference: MusicMetadataReference,
  kind: "audio" | "artwork",
  source: string | null,
  cachePath: string | null,
  state: MusicMediaState,
  durationMs: number | null = null,
) {
  const table = metadataMusic;
  const sourceColumn = kind === "audio" ? table.audioSourceUrl : table.artworkSourceUrl;
  database
    .update(table)
    .set(
      kind === "audio"
        ? { audioCachePath: cachePath, audioState: state, audioDurationMs: durationMs }
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
