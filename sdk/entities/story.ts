import { asc, desc, eq } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { DrizzleDatabase } from "../database/client.ts";
import { instagramUsers } from "./instagram-user.ts";
import { StoryItemSchema } from "../lib/story-schemas.ts";
import type { StoryItem, StoryOwner, UserTimelineStory } from "../lib/types.ts";
import {
  getStoryAnnotations,
  getStoryLocations,
  getStoryStickers,
} from "../story-sticker-location-service.ts";

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
    kind: text().notNull(),
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
  stickers: Array<typeof storyStickers.$inferSelect>,
): StoryItem {
  const item: StoryItem = { pk: story.mediaPk };
  if (stickers.length > 0) {
    item.story_stickers = stickers.map(({ kind, label }) => ({ kind, label }));
  }

  if (story.accessibilityCaption !== null) {
    item.accessibility_caption = story.accessibilityCaption;
  }
  if (story.id !== null) {
    item.id = story.id;
  }
  if (story.mediaType !== null) {
    item.media_type = story.mediaType;
  }
  if (story.originalHeight !== null) {
    item.original_height = story.originalHeight;
  }
  if (story.originalWidth !== null) {
    item.original_width = story.originalWidth;
  }
  if (story.takenAt !== null) {
    item.taken_at = story.takenAt;
  }
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

function toStoryEntry(story: StoryItem, owner?: StoryOwner): typeof stories.$inferInsert {
  return {
    accessibilityCaption: story.accessibility_caption ?? null,
    id: story.id ?? null,
    instagramUserPk: owner?.pk ?? null,
    mediaPk: story.pk,
    mediaType: story.media_type ?? null,
    originalHeight: story.original_height ?? null,
    originalWidth: story.original_width ?? null,
    takenAt: story.taken_at ?? null,
  };
}

function replaceStoryVersions(
  database: Pick<DrizzleDatabase, "insert" | "delete">,
  story: StoryItem,
): void {
  database.delete(storyImageVersions).where(eq(storyImageVersions.mediaPk, story.pk)).run();
  database.delete(storyVideoVersions).where(eq(storyVideoVersions.mediaPk, story.pk)).run();

  const imageVersionEntries = (story.image_versions2?.candidates ?? []).map(
    (version, sortOrder) => ({
      height: version.height ?? null,
      mediaPk: story.pk,
      sortOrder,
      url: version.url ?? null,
      width: version.width ?? null,
    }),
  );
  if (imageVersionEntries.length > 0) {
    database.insert(storyImageVersions).values(imageVersionEntries).run();
  }
  const videoVersionEntries = (story.video_versions ?? []).map((version, sortOrder) => ({
    height: version.height ?? null,
    mediaPk: story.pk,
    sortOrder,
    type: version.type ?? null,
    url: version.url ?? null,
    width: version.width ?? null,
  }));
  if (videoVersionEntries.length > 0) {
    database.insert(storyVideoVersions).values(videoVersionEntries).run();
  }
}

function replaceStoryAnnotations(
  database: Pick<DrizzleDatabase, "insert" | "delete">,
  story: StoryItem,
): void {
  database.delete(storyStickers).where(eq(storyStickers.mediaPk, story.pk)).run();

  const stickerEntries = getStoryAnnotations(story).map((sticker, sortOrder) => ({
    ...sticker,
    mediaPk: story.pk,
    sortOrder,
  }));
  if (stickerEntries.length > 0) {
    database.insert(storyStickers).values(stickerEntries).run();
  }
}

function getTimelineStory(
  database: DrizzleDatabase,
  story: StoryRow,
  user: typeof instagramUsers.$inferSelect,
): UserTimelineStory | null {
  if (story.takenAt === null) {
    return null;
  }

  const imageVersions = database
    .select()
    .from(storyImageVersions)
    .where(eq(storyImageVersions.mediaPk, story.mediaPk))
    .orderBy(asc(storyImageVersions.sortOrder))
    .all();
  const videoVersions = database
    .select()
    .from(storyVideoVersions)
    .where(eq(storyVideoVersions.mediaPk, story.mediaPk))
    .orderBy(asc(storyVideoVersions.sortOrder))
    .all();
  const stickers = database
    .select()
    .from(storyStickers)
    .where(eq(storyStickers.mediaPk, story.mediaPk))
    .orderBy(asc(storyStickers.sortOrder))
    .all();
  const item = toStoryItem(story, imageVersions, videoVersions, stickers);
  const items = new Map([[story.mediaPk, item]]);

  return {
    full_name: user.fullName,
    locations: getStoryLocations(story.mediaPk, items),
    owner_pk: user.pk,
    story: item,
    stickers: getStoryStickers(story.mediaPk, items),
    taken_at: story.takenAt,
    username: user.username,
  };
}

export class StoryRepository {
  private readonly database: DrizzleDatabase;

  constructor(database: DrizzleDatabase) {
    this.database = database;
  }

  findByMediaPk(mediaPk: string): StoryItem | null {
    const story = this.database.select().from(stories).where(eq(stories.mediaPk, mediaPk)).get();
    if (story === undefined) {
      return null;
    }

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

    const stickers = this.database
      .select()
      .from(storyStickers)
      .where(eq(storyStickers.mediaPk, mediaPk))
      .orderBy(asc(storyStickers.sortOrder))
      .all();
    return toStoryItem(story, imageVersions, videoVersions, stickers);
  }

  // oxlint-disable-next-line typescript/require-await -- Keep rejected-promise errors at the asynchronous repository boundary around synchronous SQLite transactions.
  async save(value: StoryItem, owner?: StoryOwner): Promise<void> {
    const story = StoryItemSchema.parse(value);
    const entry = toStoryEntry(story, owner);

    this.database.transaction((database) => {
      database
        .insert(stories)
        .values(entry)
        .onConflictDoUpdate({
          set: entry,
          target: stories.mediaPk,
        })
        .run();
      replaceStoryVersions(database, story);
      replaceStoryAnnotations(database, story);
    });
  }

  listByUsername(username: string): Array<UserTimelineStory> {
    const rows = this.database
      .select({ story: stories, user: instagramUsers })
      .from(stories)
      .innerJoin(instagramUsers, eq(stories.instagramUserPk, instagramUsers.pk))
      .where(eq(instagramUsers.username, username))
      .orderBy(desc(stories.takenAt), desc(stories.mediaPk))
      .all();

    return rows.flatMap(({ story, user }) => {
      const timelineStory = getTimelineStory(this.database, story, user);
      return timelineStory === null ? [] : [timelineStory];
    });
  }
}
