import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { stories, storyStickers } from "./story.ts";
import { mediaStates } from "./media-state.ts";

export const metadataMusic = sqliteTable(
  "metadata_music",
  {
    id: text().primaryKey().notNull().$defaultFn(randomUUID),
    instagramAudioAssetId: text().unique(),
    title: text(),
    artist: text(),
    durationMs: integer(),
    audioSourceUrl: text(),
    audioDurationMs: integer(),
    artworkSourceUrl: text(),
    audioCachePath: text(),
    artworkCachePath: text(),
    audioState: text({ enum: mediaStates }).notNull().default("unavailable"),
    artworkState: text({ enum: mediaStates }).notNull().default("unavailable"),
  },
  (table) => [
    ...[table.instagramAudioAssetId, table.title, table.artist].map((column, position) =>
      check(
        `music_text_nonempty_${position}`,
        sql`${column} IS NULL OR length(trim(${column}, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0`,
      ),
    ),
    check("music_duration_positive", sql`${table.durationMs} IS NULL OR ${table.durationMs} > 0`),
    check(
      "music_audio_duration_positive",
      sql`${table.audioDurationMs} IS NULL OR ${table.audioDurationMs} > 0`,
    ),
  ],
);
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
    musicId: text()
      .notNull()
      .references(() => metadataMusic.id),
  },
  (table) => [index("music_observations_story_source").on(table.mediaPk, table.source)],
);
function nonempty(schema: z.ZodString) {
  return schema.refine((value) => value.trim().length > 0);
}
const StoredMusicSchema = createSelectSchema(metadataMusic, {
  audioDurationMs: z.number().int().positive().nullable().default(null),
  instagramAudioAssetId: nonempty,
  title: nonempty,
  artist: nonempty,
  durationMs: (schema) => schema.int().positive(),
});
const MusicMetadataSchema = z.discriminatedUnion("status", [
  StoredMusicSchema.extend({ status: z.literal("partial") }),
  StoredMusicSchema.extend({
    status: z.literal("usable"),
    instagramAudioAssetId: nonempty(z.string()),
    title: nonempty(z.string()),
    artist: nonempty(z.string()),
  }),
]);
export const StoryMusicObservationSchema = createSelectSchema(storyMusicObservations)
  .omit({ mediaPk: true, sortOrder: true, musicId: true })
  .extend({ metadata: MusicMetadataSchema });
export type MusicFields = Omit<
  typeof metadataMusic.$inferSelect,
  "id" | "audioCachePath" | "artworkCachePath" | "audioState" | "artworkState" | "audioDurationMs"
>;
export type MusicMetadata = z.infer<typeof MusicMetadataSchema>;
export type StoryMusicObservation = z.infer<typeof StoryMusicObservationSchema>;
export type MusicMetadataReference = Pick<MusicMetadata, "id" | "status">;
export type MusicMediaState = typeof metadataMusic.$inferSelect.audioState;
export function classifyMusic(row: typeof metadataMusic.$inferSelect): MusicMetadata {
  return row.instagramAudioAssetId !== null && row.title !== null && row.artist !== null
    ? {
        ...row,
        instagramAudioAssetId: row.instagramAudioAssetId,
        title: row.title,
        artist: row.artist,
        status: "usable",
      }
    : { ...row, status: "partial" };
}
