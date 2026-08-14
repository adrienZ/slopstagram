import type { Storage } from "unstorage";

export const STORY_MEDIA_TYPES = {
  IMAGE: "image",
  VIDEO: "video",
} as const;

export type StoryMediaType = (typeof STORY_MEDIA_TYPES)[keyof typeof STORY_MEDIA_TYPES];

type StoryTrayUser = {
  full_name?: string;
  profile_pic_url?: string;
  username: string;
};

export type StoryTrayEntry = {
  id: string;
  full_name?: string;
  media_ids: string[];
  ranked_position?: number;
  seen_ranked_position?: number;
  user: StoryTrayUser;
};

export type StoriesReport = {
  xdt_api__v1__feed__reels_tray: {
    broadcasts: unknown[];
    status: string;
    story_ranking_token: string;
    tray: StoryTrayEntry[];
  };
};

type ParsedStoryTrayItem = {
  media_ids: string[];
};

export type ParsedStoryTrayUser = {
  items: ParsedStoryTrayItem[];
  username: string;
};

export type StoryVersion = {
  height?: number;
  url?: string;
  width?: number;
};

type StoryVideoVersion = StoryVersion & {
  type?: number;
};

export type StoryItem = {
  accessibility_caption?: string | null;
  image_versions2?: {
    candidates?: StoryVersion[];
  };
  id?: string;
  media_type?: number;
  original_height?: number;
  original_width?: number;
  pk: string;
  story_bloks_stickers?: unknown[] | null;
  story_bloks_tappables?: unknown[] | null;
  story_cta?: unknown[] | null;
  story_hashtags?: unknown[] | null;
  story_locations?: unknown[] | null;
  story_link_stickers?: unknown[] | null;
  story_music_stickers?: unknown[] | null;
  text_post_share_to_ig_story_stickers?: unknown[] | null;
  video_versions?: StoryVideoVersion[] | null;
  [key: string]: unknown;
};

export type StoryReel = {
  id?: string;
  items?: StoryItem[];
  media_ids?: string[];
  user?: StoryTrayUser;
  [key: string]: unknown;
};

export type StoriesMediaReport = {
  reels?: Record<string, StoryReel>;
  data?: {
    xdt_api__v1__feed__reels_media__connection?: {
      edges?: Array<{
        node?: {
          items?: StoryItem[];
        };
      }>;
    };
  };
};

export type StoryFetchFailureReason = "request_failed" | "rate_limited" | "missing_from_response";

type StoryManifestItemStatus = "ok" | "failed";

export type StoryFetchFailure = {
  attempt_count: number;
  http_status: number | null;
  media_pk: string | null;
  message: string;
  reason: StoryFetchFailureReason;
  reel_id: string;
};

export type StoryManifestItem = {
  failure_index?: number;
  ig_caption: string;
  locations: string[];
  media_type?: StoryMediaType | null;
  media_pk: string;
  preview_image_url: string | null;
  stickers: string[];
  status: StoryManifestItemStatus;
};

export type StoryManifestReel = {
  full_name: string | null;
  media_ids: string[];
  order: number;
  profile_pic_url: string | null;
  reel_id: string;
  stories: StoryManifestItem[];
  username: string;
};

type StoryOutputItem = {
  failure_index?: number;
  ig_caption: string;
  locations: string[];
  media_type?: StoryMediaType | null;
  media_pk: string;
  preview_image_url: string | null;
  stickers: string[];
  status: StoryManifestItemStatus;
};

export type StoryOutputUser = {
  full_name: string | null;
  profile_pic_url: string | null;
  reel_ids: string[];
  stories: StoryOutputItem[];
  username: string;
};

type StoryFetchCounts = {
  cache_hits: number;
  cache_misses: number;
  failed: number;
  fetched: number;
  reels: number;
  stories: number;
};

export type VisionResult = {
  text: string;
  visual: string;
};

export type VisionEntry = {
  model: string;
  prompt_hash: string;
  result: VisionResult;
};

export type UserSummaryEntry = {
  prompt_hash: string;
  result: string;
  source_hash: string;
  user_key: string;
};

export type StoriesManifestReport = {
  failures: StoryFetchFailure[];
  manifest: {
    users: StoryManifestReel[];
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
    users: StoryOutputUser[];
  };
};

export type StoryStorage = Storage<StoryItem>;
type ReportStorage = Storage<StoriesManifestReport>;
export type ImageCacheStorage = Storage<Record<string, never>>;
export type CacheStorageSet = {
  imageCacheStorage: ImageCacheStorage;
  reportsStorage: ReportStorage;
  storiesStorage: StoryStorage;
};

export type ParsedStory = {
  height: number | null;
  media_type: StoryMediaType;
  pk: string;
  story_bloks_stickers: unknown[] | null;
  story_music_stickers: unknown[] | null;
  url: string | null;
  width: number | null;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function isStoryItem(value: unknown): value is StoryItem {
  return isRecord(value) && typeof value.pk === "string";
}
