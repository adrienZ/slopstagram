import { asc, eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../database/client.ts";
import { stories, storyStickers } from "../entities/story.ts";
import {
  metadataLocations,
  partialMetadataLocations,
  storyLocationObservations,
} from "../entities/location-metadata.ts";
import {
  metadataMusic,
  partialMetadataMusic,
  storyMusicObservations,
} from "../entities/music-metadata.ts";
import { getCachedMetadataUpdates, planCachedObservations } from "../cache-metadata-service.ts";
import type { StoryItem } from "../lib/types.ts";
import { readLocationObservations, saveLocationMetadata } from "./location-metadata-repository.ts";
import { readMusicObservations, saveMusicMetadata } from "./music-metadata-repository.ts";

export class CacheMetadataRepository {
  private readonly database: DrizzleDatabase;

  constructor(database: DrizzleDatabase) {
    this.database = database;
  }

  requireInitialized(): void {
    // Preparing every required table read fails before processing any cache file.
    for (const table of [
      stories,
      storyStickers,
      storyLocationObservations,
      storyMusicObservations,
      metadataLocations,
      partialMetadataLocations,
      metadataMusic,
      partialMetadataMusic,
    ]) {
      this.database.select().from(table).limit(0).all();
    }
  }

  enrich(story: StoryItem) {
    return this.database.transaction((database) => {
      const result = { enriched: 0, partial: 0, skipped: 0, uncertain: 0, invalid: 0 };
      if (!database.select().from(stories).where(eq(stories.mediaPk, story.pk)).get()) {
        result.skipped = 1;
        return result;
      }
      const stickers = database
        .select()
        .from(storyStickers)
        .where(eq(storyStickers.mediaPk, story.pk))
        .all()
        .map(({ providerOccurrenceId, ...entry }) => ({
          ...entry,
          providerOccurrenceId: providerOccurrenceId ?? undefined,
        }));
      const { locations, music, invalid } = getCachedMetadataUpdates(story);
      result.invalid = invalid;
      for (const { source, observations } of locations) {
        const previous = readLocationObservations(database, story.pk).filter(
          (entry) => entry.source === source,
        );
        const offset =
          database
            .select()
            .from(storyLocationObservations)
            .where(eq(storyLocationObservations.mediaPk, story.pk))
            .orderBy(asc(storyLocationObservations.sortOrder))
            .all()
            .at(-1)?.sortOrder ?? -1;
        for (const [index, write] of planCachedObservations(
          story.pk,
          source,
          "location",
          observations,
          previous,
          stickers,
          (fields) => fields.instagramPlaceId,
        ).entries()) {
          if (write.skip) {
            result.uncertain += 1;
            continue;
          }
          const metadata = saveLocationMetadata(database, write.observation, write.previous, true);
          database
            .insert(storyLocationObservations)
            .values({
              id: write.id,
              mediaPk: story.pk,
              source,
              sortOrder: offset + index + 1,
              providerOccurrenceId: write.observation.providerOccurrenceId,
              occurrenceId: write.occurrenceId,
              ...metadata,
            })
            .onConflictDoUpdate({
              target: storyLocationObservations.id,
              set: { ...metadata, occurrenceId: write.occurrenceId },
            })
            .run();
          if (metadata.locationId === null) {
            result.partial += 1;
          } else {
            result.enriched += 1;
          }
          if (write.occurrenceId === null) {
            result.uncertain += 1;
          }
        }
      }
      const source = "story_music_stickers";
      const previous = readMusicObservations(database, story.pk);
      const offset =
        database
          .select()
          .from(storyMusicObservations)
          .where(eq(storyMusicObservations.mediaPk, story.pk))
          .orderBy(asc(storyMusicObservations.sortOrder))
          .all()
          .at(-1)?.sortOrder ?? -1;
      for (const [index, write] of planCachedObservations(
        story.pk,
        source,
        "music",
        music,
        previous,
        stickers,
        (fields) => fields.instagramAudioAssetId,
      ).entries()) {
        if (write.skip) {
          result.uncertain += 1;
          continue;
        }
        const metadata = saveMusicMetadata(database, write.observation, write.previous, true);
        database
          .insert(storyMusicObservations)
          .values({
            id: write.id,
            mediaPk: story.pk,
            source,
            sortOrder: offset + index + 1,
            providerOccurrenceId: write.observation.providerOccurrenceId,
            occurrenceId: write.occurrenceId,
            ...metadata,
          })
          .onConflictDoUpdate({
            target: storyMusicObservations.id,
            set: { ...metadata, occurrenceId: write.occurrenceId },
          })
          .run();
        if (metadata.musicId === null) {
          result.partial += 1;
        } else {
          result.enriched += 1;
        }
        if (write.occurrenceId === null) {
          result.uncertain += 1;
        }
      }
      if (result.enriched + result.partial + result.invalid + result.uncertain === 0) {
        result.skipped = 1;
      }
      return result;
    });
  }
}
