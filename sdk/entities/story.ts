import { randomUUID } from "node:crypto";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod";

export const stories = sqliteTable("stories", {
  accessibilityCaption: text(),
  id: text(),
  instagramUserPk: text(),
  mediaPk: text().primaryKey(),
  mediaType: integer(),
  originalHeight: integer(),
  originalWidth: integer(),
  takenAt: integer(),
});

export const storyImageVersions = sqliteTable(
  "story_image_versions",
  {
    height: integer(),
    mediaPk: text()
      .notNull()
      .references(() => stories.mediaPk, { onDelete: "cascade" }),
    sortOrder: integer().notNull(),
    url: text(),
    width: integer(),
  },
  (table) => [primaryKey({ columns: [table.mediaPk, table.sortOrder] })],
);

export const storyVideoVersions = sqliteTable(
  "story_video_versions",
  {
    height: integer(),
    mediaPk: text()
      .notNull()
      .references(() => stories.mediaPk, { onDelete: "cascade" }),
    sortOrder: integer().notNull(),
    type: integer(),
    url: text(),
    width: integer(),
  },
  (table) => [primaryKey({ columns: [table.mediaPk, table.sortOrder] })],
);

export const storyStickers = sqliteTable(
  "story_stickers",
  {
    occurrenceId: text().primaryKey().notNull().$defaultFn(randomUUID),
    providerOccurrenceId: text(),
    kind: text().notNull(),
    label: text().notNull(),
    mediaPk: text()
      .notNull()
      .references(() => stories.mediaPk, { onDelete: "cascade" }),
    sortOrder: integer().notNull(),
    source: text().notNull().default("unknown"),
  },
  (table) => [index("story_stickers_media_order").on(table.mediaPk, table.sortOrder)],
);

const StoredStoryStickerSchema = createSelectSchema(storyStickers, {
  occurrenceId: (schema) => schema.min(1),
  providerOccurrenceId: (schema) => schema.min(1),
});

// An annotation can precede persistence: IDs and source are optional, and
// missing provider IDs are omitted rather than represented by database nulls.
export const StoryStickerSchema = StoredStoryStickerSchema.omit({ mediaPk: true, sortOrder: true })
  .partial({ occurrenceId: true, source: true })
  .extend({
    providerOccurrenceId: StoredStoryStickerSchema.shape.providerOccurrenceId.unwrap().optional(),
  });

export type StorySticker = z.infer<typeof StoryStickerSchema>;
export type StoryRow = typeof stories.$inferSelect;
