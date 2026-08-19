import { z } from "zod";
import { STORY_MEDIA_TYPES } from "./types.ts";

export const StoryVersionSchema = z.object({
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
    story_bloks_stickers: z.array(z.unknown()).nullable().optional(),
    story_bloks_tappables: z.array(z.unknown()).nullable().optional(),
    story_cta: z.array(z.unknown()).nullable().optional(),
    story_hashtags: z.array(z.unknown()).nullable().optional(),
    story_locations: z.array(z.unknown()).nullable().optional(),
    story_link_stickers: z.array(z.unknown()).nullable().optional(),
    story_music_stickers: z.array(z.unknown()).nullable().optional(),
    text_post_share_to_ig_story_stickers: z.array(z.unknown()).nullable().optional(),
    video_versions: z
      .array(StoryVersionSchema.extend({ type: z.number().optional() }))
      .nullable()
      .optional(),
  })
  .catchall(z.unknown());

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
  .catchall(z.unknown());

const StoryManifestItemStatusSchema = z.enum(["ok", "failed"]);
const StoryMediaTypeSchema = z.enum([STORY_MEDIA_TYPES.IMAGE, STORY_MEDIA_TYPES.VIDEO]);
const StoryManifestItemSchema = z.object({
  failure_index: z.number().optional(),
  ig_caption: z.string(),
  locations: z.array(z.string()),
  media_type: StoryMediaTypeSchema.nullable().optional(),
  media_pk: z.string(),
  preview_image_url: z.string().nullable(),
  stickers: z.array(z.string()),
  status: StoryManifestItemStatusSchema,
});
const StoryManifestReelSchema = z.object({
  full_name: z.string().nullable().optional(),
  id: z.string().optional(),
  media_ids: z.array(z.string()),
  order: z.number(),
  pk: z.string().optional(),
  profile_pic_url: z.string().nullable().optional(),
  reel_id: z.string(),
  stories: z.array(StoryManifestItemSchema),
  username: z.string(),
});
const StoryOutputItemSchema = StoryManifestItemSchema;
const StoryOutputUserSchema = z.object({
  full_name: z.string().nullable().optional(),
  profile_pic_url: z.string().nullable().optional(),
  reel_ids: z.array(z.string()),
  stories: z.array(StoryOutputItemSchema),
  username: z.string(),
});
const StoryFetchFailureSchema = z.object({
  attempt_count: z.number(),
  http_status: z.number().nullable(),
  media_pk: z.string().nullable(),
  message: z.string(),
  reason: z.enum(["request_failed", "rate_limited", "missing_from_response"]),
  reel_id: z.string(),
});
const StoryFetchCountsSchema = z.object({
  cache_hits: z.number(),
  cache_misses: z.number(),
  failed: z.number(),
  fetched: z.number(),
  reels: z.number(),
  stories: z.number(),
});

export const StoriesManifestReportSchema = z.object({
  failures: z.array(StoryFetchFailureSchema),
  manifest: z.object({
    users: z.array(StoryManifestReelSchema),
  }),
  metadata: z.object({
    broadcasts_count: z.number(),
    counts: StoryFetchCountsSchema,
    created_at: z.string(),
    report_name: z.string(),
    status: z.string().nullable(),
    story_ranking_token: z.string().nullable(),
  }),
  output: z.object({
    users: z.array(StoryOutputUserSchema),
  }),
});
