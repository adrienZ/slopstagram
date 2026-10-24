import { randomUUID } from "node:crypto";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export interface StorySticker {
  occurrenceId?: string;
  providerOccurrenceId?: string;
  kind: string;
  label: string;
  source?: string;
}

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

export const storyStickerSources = sqliteTable(
  "story_sticker_sources",
  {
    mediaPk: text()
      .notNull()
      .references(() => stories.mediaPk, { onDelete: "cascade" }),
    source: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.mediaPk, table.source] })],
);

export type StoryRow = typeof stories.$inferSelect;
