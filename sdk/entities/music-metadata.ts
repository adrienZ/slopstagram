import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { stories, storyStickers } from "./story.ts";

const matchingStates = [
  "pending",
  "waiting_for_configuration",
  "matched",
  "ambiguous",
  "not_found",
  "failed",
] as const;

export const metadataMusic = sqliteTable(
  "metadata_music",
  {
    id: text().primaryKey().notNull().$defaultFn(randomUUID),
    instagramAudioAssetId: text().notNull().unique(),
    title: text().notNull(),
    artist: text().notNull(),
    durationMs: integer(),
    spotifyTrackId: text(),
    matchingState: text({ enum: matchingStates }).notNull().default("pending"),
  },
  (table) => [
    check("music_audio_identity_nonempty", sql`length(trim(${table.instagramAudioAssetId})) > 0`),
    check("music_title_nonempty", sql`length(trim(${table.title})) > 0`),
    check("music_artist_nonempty", sql`length(trim(${table.artist})) > 0`),
    check("music_duration_positive", sql`${table.durationMs} IS NULL OR ${table.durationMs} > 0`),
  ],
);

export const partialMetadataMusic = sqliteTable("metadata_music_partial", {
  id: text().primaryKey().notNull().$defaultFn(randomUUID),
  instagramAudioAssetId: text().unique(),
  title: text(),
  artist: text(),
  durationMs: integer(),
  spotifyTrackId: text(),
  matchingState: text({ enum: matchingStates }),
});

export const storyMusicObservations = sqliteTable(
  "story_music_observations",
  {
    id: text().primaryKey().notNull().$defaultFn(randomUUID),
    mediaPk: text()
      .notNull()
      .references(() => stories.mediaPk, { onDelete: "cascade" }),
    source: text().notNull(),
    sortOrder: integer().notNull(),
    providerOccurrenceId: text(),
    occurrenceId: text().references(() => storyStickers.occurrenceId, { onDelete: "set null" }),
    musicId: text().references(() => metadataMusic.id),
    partialMusicId: text().references(() => partialMetadataMusic.id),
  },
  (table) => [
    index("music_observations_story_source").on(table.mediaPk, table.source),
    index("music_observations_partial").on(table.partialMusicId),
    check(
      "music_observation_single_metadata",
      sql`(${table.musicId} IS NOT NULL) != (${table.partialMusicId} IS NOT NULL)`,
    ),
  ],
);

function nonempty(schema: z.ZodString) {
  return schema.refine((value) => value.trim().length > 0);
}
const MusicMetadataSchema = z.discriminatedUnion("status", [
  createSelectSchema(partialMetadataMusic, {
    instagramAudioAssetId: nonempty,
    title: nonempty,
    artist: nonempty,
    durationMs: (schema) => schema.int().positive(),
  }).extend({ status: z.literal("partial") }),
  createSelectSchema(metadataMusic, {
    instagramAudioAssetId: nonempty,
    title: nonempty,
    artist: nonempty,
    durationMs: (schema) => schema.int().positive(),
  }).extend({ status: z.literal("usable") }),
]);

export const StoryMusicObservationSchema = createSelectSchema(storyMusicObservations)
  .omit({ mediaPk: true, sortOrder: true, musicId: true, partialMusicId: true })
  .extend({ metadata: MusicMetadataSchema });

export type MusicFields = Omit<
  typeof partialMetadataMusic.$inferSelect,
  "id" | "spotifyTrackId" | "matchingState"
>;
export type MusicMetadata =
  | ({ status: "usable" } & typeof metadataMusic.$inferSelect)
  | ({ status: "partial" } & typeof partialMetadataMusic.$inferSelect);
export type StoryMusicObservation = z.infer<typeof StoryMusicObservationSchema>;
