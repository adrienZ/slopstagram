import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { stories } from "./story.ts";

// A DASH soundtrack belongs to its story, even when music metadata is shared.
export const storyAudio = sqliteTable("story_audio", {
  mediaPk: text()
    .primaryKey()
    .references(() => stories.mediaPk, { onDelete: "cascade" }),
  sourceUrl: text().notNull(),
  mimeType: text({ enum: ["audio/mp4"] }).notNull(),
  codecs: text().notNull(),
  cachePath: text(),
  durationMs: integer(),
  state: text({ enum: ["pending", "available", "unavailable", "unsupported", "failed"] })
    .notNull()
    .default("pending"),
});

export const StoryAudioSchema = createSelectSchema(storyAudio, {
  durationMs: z.number().int().positive().nullable().default(null),
});
export type StoryAudio = z.infer<typeof StoryAudioSchema>;
