import { planStoryAnnotations } from "../story-annotation-service.ts";
import { planStoryAudio } from "../story-audio-service.ts";
import { findStoryAudio, saveStoryAudio } from "./story-audio-repository.ts";
import { and, asc, desc, eq, gt, gte, lt, lte, notInArray } from "drizzle-orm";
import { useDrizzle, type DrizzleDatabase } from "../database/client.ts";
import { instagramUsers } from "../entities/instagram-user.ts";
import {
  enrichStoryLocations,
  fillTaggedPlace,
  readLocationObservations,
} from "./location-metadata-repository.ts";
import type { PlaceFillInput } from "../location-metadata-service.ts";
import {
  enrichStoryMusic,
  readMusicObservations,
  refreshMusicAsset,
} from "./music-metadata-repository.ts";
import type { MusicObservationInput } from "../music-observation-service.ts";
import {
  stories,
  type StoryRow,
  storyImageVersions,
  storyVideoVersions,
  storyStickers,
} from "../entities/story.ts";
import { createLogger, type Logger } from "../lib/logging-service.ts";
import { StoryItemSchema } from "../lib/story-schemas.ts";
import type { StoryAnnotations, StoryItem, StoryOwner, UserTimelineStory } from "../lib/types.ts";
import {
  getStoryAnnotations,
  getStoryAnnotationUpdates,
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

function replaceStoryVersions(database: AnnotationDatabase, story: StoryItem): void {
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

type AnnotationDatabase = Pick<DrizzleDatabase, "select" | "insert" | "update" | "delete">;

function readStoryAnnotations(database: AnnotationDatabase, mediaPk: string): StoryAnnotations {
  const stickers = database
    .select({
      occurrenceId: storyStickers.occurrenceId,
      providerOccurrenceId: storyStickers.providerOccurrenceId,
      kind: storyStickers.kind,
      label: storyStickers.label,
      source: storyStickers.source,
    })
    .from(storyStickers)
    .where(eq(storyStickers.mediaPk, mediaPk))
    .orderBy(asc(storyStickers.sortOrder))
    .all()
    .map(({ providerOccurrenceId, ...sticker }) =>
      providerOccurrenceId === null ? sticker : { ...sticker, providerOccurrenceId },
    );
  const locations = stickers
    .filter((sticker) => sticker.kind === "location")
    .map((sticker) => sticker.label);
  const locationObservations = readLocationObservations(database, mediaPk);
  const annotations: StoryAnnotations = { locations, stickers };
  const audio = findStoryAudio(database, mediaPk);
  if (audio) {
    annotations.storyAudio = audio;
  }
  if (locationObservations.length > 0) {
    annotations.locationObservations = locationObservations;
  }
  const musicObservations = readMusicObservations(database, mediaPk);
  if (musicObservations.length > 0) {
    annotations.musicObservations = musicObservations;
  }
  return annotations;
}

function replaceStoryAnnotations(
  database: AnnotationDatabase,
  story: StoryItem,
  logger: Pick<Logger, "warn">,
): void {
  const previous = readStoryAnnotations(database, story.pk);
  const updates =
    story.annotations === undefined
      ? getStoryAnnotationUpdates(story, (source) => {
          logger.warn(
            `Malformed story annotation source: media_pk=${story.pk} source=${source}; preserving saved contribution`,
          );
        })
      : [];
  const { stickerEntries } = planStoryAnnotations(previous, story, updates);
  database
    .delete(storyStickers)
    .where(
      stickerEntries.length === 0
        ? eq(storyStickers.mediaPk, story.pk)
        : and(
            eq(storyStickers.mediaPk, story.pk),
            notInArray(
              storyStickers.occurrenceId,
              stickerEntries.map(({ occurrenceId }) => occurrenceId),
            ),
          ),
    )
    .run();
  for (const entry of stickerEntries) {
    database
      .insert(storyStickers)
      .values(entry)
      .onConflictDoUpdate({
        target: storyStickers.occurrenceId,
        set: entry,
      })
      .run();
  }
  const current = readStoryAnnotations(database, story.pk);
  enrichStoryLocations(database, story, current);
  enrichStoryMusic(database, story, current);
  saveStoryAudio(
    database,
    story.pk,
    planStoryAudio(story, readStoryAnnotations(database, story.pk), previous.storyAudio),
  );
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

  refreshMusicAsset(mediaPk: string, observationId: string, observation: MusicObservationInput) {
    this.database.transaction((database) => {
      const previous = readMusicObservations(database, mediaPk).find(
        ({ id }) => id === observationId,
      );
      if (previous !== undefined && previous.metadata.instagramAudioAssetId !== null) {
        refreshMusicAsset(database, previous, observation);
      }
    });
  }

  fillTaggedPlace(instagramPlaceId: string, incoming: PlaceFillInput) {
    fillTaggedPlace(this.database, instagramPlaceId, incoming);
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
    await Promise.try(() => {
      const story = StoryItemSchema.parse(value);
      const entry = toStoryEntry(story, owner);

      this.database.transaction((transaction) => {
        transaction
          .insert(stories)
          .values(entry)
          .onConflictDoUpdate({
            set: entry,
            target: stories.mediaPk,
          })
          .run();
        replaceStoryVersions(transaction, story);
        replaceStoryAnnotations(transaction, story, this.logger);
      });
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
