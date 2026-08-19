import { asc, eq } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { DrizzleDatabase } from "../database/client.ts";
import { StoryItemSchema } from "../lib/story-schemas.ts";
import type { StoryItem } from "../lib/types.ts";
import { getStoryLocations, getStoryStickers } from "../story-sticker-location-service.ts";

export const stories = sqliteTable("stories", {
  accessibilityCaption: text(),
  id: text(),
  mediaPk: text().primaryKey(),
  mediaType: integer(),
  originalHeight: integer(),
  originalWidth: integer(),
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
    kind: text().notNull(),
    label: text().notNull(),
    mediaPk: text()
      .notNull()
      .references(() => stories.mediaPk, { onDelete: "cascade" }),
    sortOrder: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.mediaPk, table.sortOrder] })],
);

export const storyLocations = sqliteTable(
  "story_locations",
  {
    label: text().notNull(),
    mediaPk: text()
      .notNull()
      .references(() => stories.mediaPk, { onDelete: "cascade" }),
    sortOrder: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.mediaPk, table.sortOrder] })],
);

type StoryRow = typeof stories.$inferSelect;

function toStoryItem(
  story: StoryRow,
  imageVersions: Array<typeof storyImageVersions.$inferSelect>,
  videoVersions: Array<typeof storyVideoVersions.$inferSelect>,
): StoryItem {
  const item: StoryItem = { pk: story.mediaPk };

  if (story.accessibilityCaption !== null) item.accessibility_caption = story.accessibilityCaption;
  if (story.id !== null) item.id = story.id;
  if (story.mediaType !== null) item.media_type = story.mediaType;
  if (story.originalHeight !== null) item.original_height = story.originalHeight;
  if (story.originalWidth !== null) item.original_width = story.originalWidth;
  if (imageVersions.length > 0) {
    item.image_versions2 = {
      candidates: imageVersions.map((version) => ({
        height: version.height ?? undefined,
        url: version.url ?? undefined,
        width: version.width ?? undefined,
      })),
    };
  }
  if (videoVersions.length > 0) {
    item.video_versions = videoVersions.map((version) => ({
      height: version.height ?? undefined,
      type: version.type ?? undefined,
      url: version.url ?? undefined,
      width: version.width ?? undefined,
    }));
  }

  return StoryItemSchema.parse(item);
}

function getStickerKind(label: string): string {
  const separator = label.indexOf(":");
  return separator === -1 ? "other" : label.slice(0, separator);
}

function toStoryEntry(story: StoryItem): typeof stories.$inferInsert {
  return {
    accessibilityCaption: story.accessibility_caption ?? null,
    id: story.id ?? null,
    mediaPk: story.pk,
    mediaType: story.media_type ?? null,
    originalHeight: story.original_height ?? null,
    originalWidth: story.original_width ?? null,
  };
}

async function replaceStoryVersions(database: DrizzleDatabase, story: StoryItem): Promise<void> {
  await database.delete(storyImageVersions).where(eq(storyImageVersions.mediaPk, story.pk));
  await database.delete(storyVideoVersions).where(eq(storyVideoVersions.mediaPk, story.pk));

  for (const [sortOrder, version] of (story.image_versions2?.candidates ?? []).entries()) {
    await database.insert(storyImageVersions).values({
      height: version.height ?? null,
      mediaPk: story.pk,
      sortOrder,
      url: version.url ?? null,
      width: version.width ?? null,
    });
  }
  for (const [sortOrder, version] of (story.video_versions ?? []).entries()) {
    await database.insert(storyVideoVersions).values({
      height: version.height ?? null,
      mediaPk: story.pk,
      sortOrder,
      type: version.type ?? null,
      url: version.url ?? null,
      width: version.width ?? null,
    });
  }
}

async function replaceStoryAnnotations(database: DrizzleDatabase, story: StoryItem): Promise<void> {
  await database.delete(storyStickers).where(eq(storyStickers.mediaPk, story.pk));
  await database.delete(storyLocations).where(eq(storyLocations.mediaPk, story.pk));

  for (const [sortOrder, label] of getStoryStickers(
    story.pk,
    new Map([[story.pk, story]]),
  ).entries()) {
    await database.insert(storyStickers).values({
      kind: getStickerKind(label),
      label,
      mediaPk: story.pk,
      sortOrder,
    });
  }
  for (const [sortOrder, label] of getStoryLocations(
    story.pk,
    new Map([[story.pk, story]]),
  ).entries()) {
    await database.insert(storyLocations).values({ mediaPk: story.pk, label, sortOrder });
  }
}

export class StoryRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  findByMediaPk(mediaPk: string): Promise<StoryItem | null> {
    const story = this.database.select().from(stories).where(eq(stories.mediaPk, mediaPk)).get();
    if (story === undefined) return Promise.resolve(null);

    const imageVersions = this.database
      .select()
      .from(storyImageVersions)
      .where(eq(storyImageVersions.mediaPk, mediaPk))
      .orderBy(asc(storyImageVersions.sortOrder))
      .all();
    const videoVersions = this.database
      .select()
      .from(storyVideoVersions)
      .where(eq(storyVideoVersions.mediaPk, mediaPk))
      .orderBy(asc(storyVideoVersions.sortOrder))
      .all();

    return Promise.resolve(toStoryItem(story, imageVersions, videoVersions));
  }

  async save(value: StoryItem): Promise<void> {
    const story = StoryItemSchema.parse(value);
    const entry = toStoryEntry(story);

    await this.database.insert(stories).values(entry).onConflictDoUpdate({
      set: entry,
      target: stories.mediaPk,
    });
    await replaceStoryVersions(this.database, story);
    await replaceStoryAnnotations(this.database, story);
  }
}
