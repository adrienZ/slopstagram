import { z } from "zod";
import { StoryLocationObservationSchema } from "../entities/location-metadata.ts";
import { StoryMusicObservationSchema } from "../entities/music-metadata.ts";
import { StoryAudioSchema } from "../entities/story-audio.ts";
import {
  ReportFailureSchema,
  ReportSchema,
  ReportStoryGroupSchema,
  ReportStorySchema,
} from "../entities/report.ts";
import { StoryStickerSchema } from "../entities/story.ts";
import { JsonValueSchema } from "./json-value.ts";

const StoryVersionSchema = z.object({
  height: z.number().optional(),
  url: z.string().optional(),
  width: z.number().optional(),
});

// Instagram returns identifiers as either JSON strings or numbers, depending on
// the endpoint and account. Keep the application boundary consistently string
// based so identifiers remain suitable for map keys and database columns.
const InstagramIdentifierSchema = z.union([z.string(), z.number()]).transform(String);

export const StoryTrayEntrySchema = z.object({
  id: InstagramIdentifierSchema,
  full_name: z.string().optional(),
  media_ids: z.array(InstagramIdentifierSchema),
  ranked_position: z.number().optional(),
  seen_ranked_position: z.number().optional(),
  user: z.object({
    full_name: z.string().optional(),
    id: InstagramIdentifierSchema.optional(),
    pk: InstagramIdentifierSchema.optional(),
    profile_pic_url: z.string().optional(),
    username: z.string(),
  }),
});

export const StoryItemSchema = z
  .object({
    accessibility_caption: z.string().nullable().optional(),
    video_dash_manifest: z.string().nullable().optional(),
    annotations: z
      .object({
        storyAudio: StoryAudioSchema.optional(),
        locationObservations: z.array(StoryLocationObservationSchema).optional(),
        musicObservations: z.array(StoryMusicObservationSchema).optional(),
        locations: z.array(z.string()),
        stickers: z.array(StoryStickerSchema),
      })
      .optional(),
    image_versions2: z
      .object({
        candidates: z.array(StoryVersionSchema).optional(),
      })
      .optional(),
    id: InstagramIdentifierSchema.optional(),
    media_type: z.number().optional(),
    original_height: z.number().optional(),
    original_width: z.number().optional(),
    pk: InstagramIdentifierSchema,
    story_bloks_stickers: JsonValueSchema.optional(),
    story_bloks_tappables: JsonValueSchema.optional(),
    story_cta: JsonValueSchema.optional(),
    story_hashtags: JsonValueSchema.optional(),
    story_locations: JsonValueSchema.optional(),
    story_link_stickers: JsonValueSchema.optional(),
    story_music_stickers: JsonValueSchema.optional(),
    taken_at: z.number().int().optional(),
    text_post_share_to_ig_story_stickers: JsonValueSchema.optional(),
    video_versions: z
      .array(StoryVersionSchema.extend({ type: z.number().optional() }))
      .nullable()
      .optional(),
  })
  .catchall(JsonValueSchema);

export const StoryReelSchema = z
  .object({
    id: InstagramIdentifierSchema.optional(),
    items: z.array(StoryItemSchema).optional(),
    media_ids: z.array(InstagramIdentifierSchema).optional(),
    user: z
      .object({
        full_name: z.string().optional(),
        id: InstagramIdentifierSchema.optional(),
        pk: InstagramIdentifierSchema.optional(),
        profile_pic_url: z.string().optional(),
        username: z.string(),
      })
      .optional(),
  })
  .catchall(JsonValueSchema);

// Wire keys are snake_case, so the drizzle schemas supply each field's type
// rather than being picked wholesale. List columns stay string arrays: the
// report tables store them as JSON text.
export const StoryManifestItemSchema = z.object({
  failure_index: ReportStorySchema.shape.failureIndex.unwrap().optional(),
  ig_caption: z.string(),
  locations: z.array(z.string()),
  media_type: ReportStorySchema.shape.mediaType.optional(),
  media_pk: ReportStorySchema.shape.mediaPk,
  preview_image_url: ReportStorySchema.shape.previewImageUrl,
  stickers: z.array(z.string()),
  status: ReportStorySchema.shape.status,
});
export const StoryManifestReelSchema = z.object({
  full_name: ReportStoryGroupSchema.shape.fullName.optional(),
  id: ReportStoryGroupSchema.shape.instagramId.unwrap().optional(),
  media_ids: z.array(z.string()),
  order: ReportStoryGroupSchema.shape.sortOrder,
  pk: ReportStoryGroupSchema.shape.instagramPk.unwrap().optional(),
  profile_pic_url: ReportStoryGroupSchema.shape.profilePicUrl.optional(),
  reel_id: ReportStoryGroupSchema.shape.reelId,
  stories: z.array(StoryManifestItemSchema),
  username: ReportStoryGroupSchema.shape.username,
});
export const StoryOutputUserSchema = z.object({
  full_name: StoryManifestReelSchema.shape.full_name,
  profile_pic_url: StoryManifestReelSchema.shape.profile_pic_url,
  reel_ids: z.array(z.string()),
  stories: z.array(StoryManifestItemSchema),
  username: StoryManifestReelSchema.shape.username,
});
export const StoryFetchFailureSchema = z.object({
  attempt_count: ReportFailureSchema.shape.attemptCount,
  http_status: ReportFailureSchema.shape.httpStatus,
  media_pk: ReportFailureSchema.shape.mediaPk,
  message: ReportFailureSchema.shape.message,
  reason: ReportFailureSchema.shape.reason,
  reel_id: ReportFailureSchema.shape.reelId,
});
const StoryFetchCountsSchema = z.object({
  cache_hits: ReportSchema.shape.cacheHits,
  cache_misses: ReportSchema.shape.cacheMisses,
  failed: ReportSchema.shape.failedCount,
  fetched: ReportSchema.shape.fetchedCount,
  reels: ReportSchema.shape.reelsCount,
  stories: ReportSchema.shape.storiesCount,
});

export const StoriesManifestReportSchema = z.object({
  failures: z.array(StoryFetchFailureSchema),
  manifest: z.object({
    users: z.array(StoryManifestReelSchema),
  }),
  metadata: z.object({
    broadcasts_count: ReportSchema.shape.broadcastsCount,
    counts: StoryFetchCountsSchema,
    created_at: ReportSchema.shape.createdAt,
    report_name: ReportSchema.shape.reportName,
    status: ReportSchema.shape.status,
    story_ranking_token: ReportSchema.shape.storyRankingToken,
  }),
  output: z.object({
    users: z.array(StoryOutputUserSchema),
  }),
});
