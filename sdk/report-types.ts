import type { reportFailures, reportStories } from "./entities/report.ts";
import type { StoryMediaType } from "./story-types.ts";

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

interface StoryFetchCounts {
  cache_hits: number;
  cache_misses: number;
  failed: number;
  fetched: number;
  reels: number;
  stories: number;
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
