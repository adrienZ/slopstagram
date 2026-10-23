import { and, asc, desc, eq, gt, gte, lt, lte } from "drizzle-orm";
import { useDrizzle, type DrizzleDatabase } from "../database/client.ts";
import { instagramUsers } from "../entities/instagram-user.ts";
import {
  stories,
  type StoryRow,
  storyImageVersions,
  storyVideoVersions,
  storyStickers,
  storyStickerSources,
} from "../entities/story.ts";
import { createLogger, type Logger } from "../lib/logging-service.ts";
import { StoryItemSchema } from "../lib/story-schemas.ts";
import type { StoryAnnotations, StoryItem, StoryOwner, UserTimelineStory } from "../lib/types.ts";
import {
  getStoryAnnotations,
  getStoryAnnotationUpdates,
  annotationSources,
  getStoryLocations,
  getStoryStickers,
} from "../story-sticker-location-service.ts";

function toStoryItem(
  story: StoryRow,
  imageVersions: Array<typeof storyImageVersions.$inferSelect>,
  videoVersions: Array<typeof storyVideoVersions.$inferSelect>,
  annotations: StoryAnnotations,
): StoryItem {
  const item: StoryItem = { annotations, pk: story.mediaPk };

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

  return StoryItemSchema.parse({ ...item, annotations: getStoryAnnotations(item) });
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

async function replaceStoryVersions(database: DrizzleDatabase, story: StoryItem): Promise<void> {
  await database.delete(storyImageVersions).where(eq(storyImageVersions.mediaPk, story.pk));
  await database.delete(storyVideoVersions).where(eq(storyVideoVersions.mediaPk, story.pk));

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
    await database.insert(storyImageVersions).values(imageVersionEntries);
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
    await database.insert(storyVideoVersions).values(videoVersionEntries);
  }
}

type AnnotationDatabase = Pick<DrizzleDatabase, "select" | "insert" | "delete">;

function mergeAnnotationUpdates(
  previous: StoryAnnotations,
  story: StoryItem,
  logger: Pick<Logger, "warn">,
): StoryAnnotations {
  const updates = getStoryAnnotationUpdates(story, (source) => {
    logger.warn(
      `Malformed story annotation source: media_pk=${story.pk} source=${source}; preserving saved contribution`,
    );
  });
  const replaced = new Set<string>(updates.map((update) => update.source));
  const order: Array<string> = annotationSources.map(({ source }) => source);
  const completedKinds = new Set<string>(
    annotationSources
      .flatMap(({ kinds }) => [...kinds])
      .filter((kind) =>
        annotationSources.every(
          ({ source, kinds }) =>
            !kinds.some((candidate) => candidate === kind) || replaced.has(source),
        ),
      ),
  );
  const stickers = [
    ...previous.stickers.filter(
      (sticker) =>
        !replaced.has(sticker.source ?? "unknown") &&
        !((sticker.source ?? "unknown") === "unknown" && completedKinds.has(sticker.kind)),
    ),
    ...updates.flatMap((update) => update.stickers),
  ].toSorted(
    (left, right) =>
      order.indexOf(left.source ?? "unknown") - order.indexOf(right.source ?? "unknown"),
  );
  return {
    locations: stickers
      .filter((sticker) => sticker.kind === "location")
      .map((sticker) => sticker.label),
    stickers,
    sources: [...new Set([...(previous.sources ?? []), ...replaced])].toSorted((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function readStoryAnnotations(database: AnnotationDatabase, mediaPk: string): StoryAnnotations {
  const stickers = database
    .select({ kind: storyStickers.kind, label: storyStickers.label, source: storyStickers.source })
    .from(storyStickers)
    .where(eq(storyStickers.mediaPk, mediaPk))
    .orderBy(asc(storyStickers.sortOrder))
    .all();
  const sources = database
    .select({ source: storyStickerSources.source })
    .from(storyStickerSources)
    .where(eq(storyStickerSources.mediaPk, mediaPk))
    .orderBy(asc(storyStickerSources.source))
    .all()
    .map((entry) => entry.source);
  const locations = stickers
    .filter((sticker) => sticker.kind === "location")
    .map((sticker) => sticker.label);
  return { locations, stickers, sources };
}

function replaceStoryAnnotations(
  database: AnnotationDatabase,
  story: StoryItem,
  logger: Pick<Logger, "warn">,
): void {
  const previous = readStoryAnnotations(database, story.pk);
  const annotations =
    story.annotations === undefined
      ? mergeAnnotationUpdates(previous, story, logger)
      : getStoryAnnotations(story);
  database.delete(storyStickers).where(eq(storyStickers.mediaPk, story.pk)).run();
  database.delete(storyStickerSources).where(eq(storyStickerSources.mediaPk, story.pk)).run();
  const stickers = [...annotations.stickers];
  if (!stickers.some((sticker) => sticker.kind === "location")) {
    stickers.push(...annotations.locations.map((label) => ({ kind: "location", label })));
  }
  const stickerEntries = stickers.map((sticker, sortOrder) => ({
    ...sticker,
    // Raw source extraction already produces content-only labels. Explicit
    // annotations may come from older callers that still add the kind prefix.
    label:
      story.annotations !== undefined && sticker.label.startsWith(`${sticker.kind}:`)
        ? sticker.label.slice(sticker.kind.length + 1)
        : sticker.label,
    source: sticker.source ?? "unknown",
    mediaPk: story.pk,
    sortOrder,
  }));
  if (stickerEntries.length > 0) {
    database.insert(storyStickers).values(stickerEntries).run();
  }
  const sources = [...new Set(annotations.sources)];
  if (sources.length > 0) {
    database
      .insert(storyStickerSources)
      .values(sources.map((source) => ({ source, mediaPk: story.pk })))
      .run();
  }
}

function readStoryItem(database: DrizzleDatabase, story: StoryRow): StoryItem {
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
  return toStoryItem(
    story,
    imageVersions,
    videoVersions,
    readStoryAnnotations(database, story.mediaPk),
  );
}

function getTimelineStory(
  database: DrizzleDatabase,
  story: StoryRow,
  user: typeof instagramUsers.$inferSelect,
): UserTimelineStory | null {
  if (story.takenAt === null) {
    return null;
  }

  const item = readStoryItem(database, story);
  const cachedItems = new Map([[item.pk, item]]);
  return {
    full_name: user.fullName,
    locations: getStoryLocations(item.pk, cachedItems),
    owner_pk: user.pk,
    story: item,
    stickers: getStoryStickers(item.pk, cachedItems),
    taken_at: story.takenAt,
    username: user.username,
  };
}

export class StoryRepository {
  private readonly database: DrizzleDatabase;

  private readonly logger: Pick<Logger, "warn">;

  constructor(
    database: DrizzleDatabase,
    logger: Pick<Logger, "warn"> = createLogger("story-annotations"),
  ) {
    this.logger = logger;
    this.database = database;
  }

  findByMediaPk(mediaPk: string): StoryItem | null {
    const story = this.database.select().from(stories).where(eq(stories.mediaPk, mediaPk)).get();
    if (story === undefined) {
      return null;
    }

    return readStoryItem(this.database, story);
  }

  listStickerKinds(): Array<string> {
    return this.database
      .selectDistinct({ kind: storyStickers.kind })
      .from(storyStickers)
      .orderBy(asc(storyStickers.kind))
      .all()
      .map(({ kind }) => kind);
  }

  async save(value: StoryItem, owner?: StoryOwner): Promise<void> {
    const story = StoryItemSchema.parse(value);
    const entry = toStoryEntry(story, owner);

    await this.database.insert(stories).values(entry).onConflictDoUpdate({
      set: entry,
      target: stories.mediaPk,
    });
    await replaceStoryVersions(this.database, story);
    this.database.transaction((transaction) => {
      replaceStoryAnnotations(transaction, story, this.logger);
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

  listPublicationTimes(now: Date) {
    return this.database
      .select({ mediaPk: stories.mediaPk, takenAt: stories.takenAt })
      .from(stories)
      .innerJoin(instagramUsers, eq(stories.instagramUserPk, instagramUsers.pk))
      .where(lte(stories.takenAt, now.getTime() / 1000))
      .all()
      .flatMap(({ mediaPk, takenAt }) => (takenAt === null ? [] : [{ mediaPk, takenAt }]));
  }

  listActive(now: Date): Array<UserTimelineStory> {
    const publishedBefore = now.getTime() / 1000;
    const rows = this.database
      .select({ story: stories, user: instagramUsers })
      .from(stories)
      .innerJoin(instagramUsers, eq(stories.instagramUserPk, instagramUsers.pk))
      .where(
        and(gt(stories.takenAt, publishedBefore - 86_400), lte(stories.takenAt, publishedBefore)),
      )
      .orderBy(desc(stories.takenAt), asc(instagramUsers.username), asc(stories.mediaPk))
      .all();

    return rows.flatMap(({ story, user }) => {
      const entry = getTimelineStory(this.database, story, user);
      return entry === null ? [] : [entry];
    });
  }

  listPublishedBetween(start: Date, end: Date): Array<UserTimelineStory> {
    const rows = this.database
      .select({ story: stories, user: instagramUsers })
      .from(stories)
      .innerJoin(instagramUsers, eq(stories.instagramUserPk, instagramUsers.pk))
      .where(
        and(
          gte(stories.takenAt, start.getTime() / 1000),
          lt(stories.takenAt, end.getTime() / 1000),
        ),
      )
      .orderBy(desc(stories.takenAt), asc(instagramUsers.username), asc(stories.mediaPk))
      .all();

    return rows.flatMap(({ story, user }) => {
      const entry = getTimelineStory(this.database, story, user);
      return entry === null ? [] : [entry];
    });
  }
}

export const storyRepository = new StoryRepository(useDrizzle());
