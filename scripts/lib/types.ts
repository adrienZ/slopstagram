import type { Storage } from "unstorage";

export const STORY_MEDIA_TYPES = {
  IMAGE: "image",
  VIDEO: "video",
} as const;

export type StoryMediaType =
  (typeof STORY_MEDIA_TYPES)[keyof typeof STORY_MEDIA_TYPES];

export type StoryTrayUser = {
  full_name?: string;
  username?: string;
};

export type StoryTrayEntry = {
  id: string;
  full_name?: string;
  media_ids?: string[];
  ranked_position?: number;
  seen_ranked_position?: number;
  user?: StoryTrayUser;
};

export type StoriesReport = {
  xdt_api__v1__feed__reels_tray?: {
    tray?: StoryTrayEntry[];
  };
};

export type ParsedStoryTrayItem = {
  media_ids: string[];
};

export type ParsedStoryTrayUser = {
  items: ParsedStoryTrayItem[];
  username: string | null;
};

export type StoryVersion = {
  height?: number;
  url?: string;
  width?: number;
};

export type StoryVideoVersion = StoryVersion & {
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
  story_music_stickers?: unknown[] | null;
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

export type StoryFetchFailureReason =
  | "request_failed"
  | "rate_limited"
  | "missing_from_response";

export type StoryManifestItemStatus = "cached" | "fetched" | "failed";

export type StoryFetchFailure = {
  attempt_count: number;
  http_status: number | null;
  media_pk: string | null;
  message: string;
  reason: StoryFetchFailureReason;
  reel_id: string;
};

export type StoryManifestItem = {
  accessibility_caption: string;
  cache_key: string;
  failure_index?: number;
  media_pk: string;
  status: StoryManifestItemStatus;
};

export type StoryManifestReel = {
  full_name: string | null;
  media_ids: string[];
  order: number;
  reel_id: string;
  stories: StoryManifestItem[];
  username: string | null;
};

export type StoryOutputItem = {
  accessibility_caption: string;
  failure_index?: number;
  media_pk: string;
  status: StoryManifestItemStatus;
};

export type StoryOutputUser = {
  full_name: string | null;
  reel_ids: string[];
  stories: StoryOutputItem[];
  username: string | null;
};

export type StoryFetchCounts = {
  cache_hits: number;
  cache_misses: number;
  failed: number;
  fetched: number;
  reels: number;
  stories: number;
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

export type TrayStorage = Storage<StoriesReport>;
export type StoryStorage = Storage<StoryItem>;
export type ReportStorage = Storage<StoriesManifestReport>;
export type CacheStorageSet = {
  reportsStorage: ReportStorage;
  storiesStorage: StoryStorage;
  strayStorage: StoryStorage;
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
