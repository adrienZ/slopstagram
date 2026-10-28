import type { Storage } from "unstorage";
import type { StorySticker } from "../entities/story.ts";
import type { StoryLocationObservation } from "../entities/location-metadata.ts";
import type { StoryMusicObservation } from "../entities/music-metadata.ts";
import type { StoryAudio } from "../entities/story-audio.ts";
import type { reportStories, reportFailures } from "../entities/report.ts";
import type { JsonValue } from "./json-value.ts";

export const STORY_MEDIA_TYPES = {
  IMAGE: "image",
  VIDEO: "video",
} as const;

export type StoryMediaType = (typeof STORY_MEDIA_TYPES)[keyof typeof STORY_MEDIA_TYPES];

interface StoryTrayUser {
  full_name?: string;
  id?: string;
  pk?: string;
  profile_pic_url?: string;
  username: string;
}

export interface StoryTrayEntry {
  id: string;
  full_name?: string;
  media_ids: Array<string>;
  ranked_position?: number;
  seen_ranked_position?: number;
  user: StoryTrayUser;
}

export interface StoriesReport {
  xdt_api__v1__feed__reels_tray: {
    broadcasts: Array<JsonValue>;
    status: string;
    story_ranking_token: string;
    tray: Array<StoryTrayEntry>;
  };
}

interface ParsedStoryTrayItem {
  media_ids: Array<string>;
}

export interface ParsedStoryTrayUser {
  items: Array<ParsedStoryTrayItem>;
  username: string;
}

export interface StoryVersion {
  height?: number;
  url?: string;
  width?: number;
}

interface StoryImageVersions {
  candidates?: Array<StoryVersion>;
}

type StoryVideoVersion = StoryVersion & {
  type?: number;
};

export interface StoryAnnotations {
  storyAudio?: StoryAudio;
  locationObservations?: Array<StoryLocationObservation>;
  musicObservations?: Array<StoryMusicObservation>;
  locations: Array<string>;
  stickers: Array<StorySticker>;
}

export interface StoryItem {
  accessibility_caption?: string | null;
  // Labels and kinds from stored story data, separate from Instagram's raw fields.
  annotations?: StoryAnnotations;
  image_versions2?: StoryImageVersions;
  id?: string;
  link?: JsonValue;
  media_type?: number;
  original_height?: number;
  original_width?: number;
  pk: string;
  story_bloks_stickers?: JsonValue;
  story_bloks_tappables?: JsonValue;
  story_cta?: JsonValue;
  story_hashtags?: JsonValue;
  story_locations?: JsonValue;
  story_link_stickers?: JsonValue;
  story_music_stickers?: JsonValue;
  taken_at?: number;
  text_post_share_to_ig_story_stickers?: JsonValue;
  video_versions?: Array<StoryVideoVersion> | null;
  video_dash_manifest?: string | null;
  [key: string]:
    | Array<StoryVideoVersion>
    | JsonValue
    | StoryAnnotations
    | StoryImageVersions
    | undefined;
}

export interface StoryOwner {
  full_name?: string;
  pk?: string;
  profile_pic_url?: string;
  username: string;
}

export interface UserTimelineStory {
  full_name: string | null;
  locations: Array<string>;
  owner_pk: string | null;
  story: StoryItem;
  stickers: Array<string>;
  taken_at: number;
  username: string;
}

export interface StoryReel {
  id?: string;
  items?: Array<StoryItem>;
  media_ids?: Array<string>;
  user?: StoryTrayUser;
}

export interface StoriesMediaReport {
  reels?: Record<string, StoryReel>;
  data?: {
    xdt_api__v1__feed__reels_media__connection?: {
      edges?: Array<{
        node?: {
          items?: Array<StoryItem>;
        };
      }>;
    };
  };
}

export type StoryFetchFailureReason = typeof reportFailures.$inferSelect.reason;

type StoryManifestItemStatus = typeof reportStories.$inferSelect.status;

export interface StoryFetchFailure {
  attempt_count: number;
  http_status: number | null;
  media_pk: string | null;
  message: string;
  reason: StoryFetchFailureReason;
  reel_id: string;
}

export interface StoryManifestItem {
  failure_index?: number;
  ig_caption: string;
  locations: Array<string>;
  media_type?: StoryMediaType | null;
  media_pk: string;
  preview_image_url: string | null;
  stickers: Array<string>;
  status: StoryManifestItemStatus;
}

export interface StoryManifestReel {
  full_name?: string | null;
  id?: string;
  media_ids: Array<string>;
  order: number;
  pk?: string;
  profile_pic_url?: string | null;
  reel_id: string;
  stories: Array<StoryManifestItem>;
  username: string;
}

interface StoryOutputItem {
  failure_index?: number;
  ig_caption: string;
  locations: Array<string>;
  media_type?: StoryMediaType | null;
  media_pk: string;
  preview_image_url: string | null;
  stickers: Array<string>;
  status: StoryManifestItemStatus;
}

export interface StoryOutputUser {
  full_name?: string | null;
  profile_pic_url?: string | null;
  reel_ids: Array<string>;
  stories: Array<StoryOutputItem>;
  username: string;
}

export interface InstagramUserEntry {
  full_name: string | null;
  id: string;
  pk: string;
  username: string;
}

interface StoryFetchCounts {
  cache_hits: number;
  cache_misses: number;
  failed: number;
  fetched: number;
  reels: number;
  stories: number;
}

export interface VisionResult {
  text: string;
  visual: string;
}

export interface VisionEntry {
  model: string;
  prompt_hash: string;
  result: VisionResult;
}

export interface UserSummaryEntry {
  prompt_hash: string;
  result: string;
  source_hash: string;
  user_key: string;
}

export interface StoriesManifestReport {
  failures: Array<StoryFetchFailure>;
  manifest: {
    users: Array<StoryManifestReel>;
  };
  metadata: {
    broadcasts_count: number;
    counts: StoryFetchCounts;
    created_at: string;
    report_name: string;
    status: string | null;
    story_ranking_token: string | null;
  };
  output: {
    users: Array<StoryOutputUser>;
  };
}

export type ImageCacheStorage = Storage<Record<string, never>>;
export type AudioCacheStorage = Storage<Record<string, never>>;
export type StoryStorage = Storage<StoryItem>;

export interface ParsedStory {
  height: number | null;
  media_type: StoryMediaType;
  pk: string;
  story_bloks_stickers: Array<JsonValue> | null;
  story_music_stickers: Array<JsonValue> | null;
  url: string | null;
  width: number | null;
}
