import type { JsonValue } from "./lib/json-value.ts";
import type { StoryAnnotations } from "./story-types.ts";

// Shapes of the Instagram web API payloads and of the client that requests them.

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

export interface ReelTrayResponse {
  broadcasts: Array<unknown>;
  story_ranking_token: string;
  status: string;
  tray: Array<StoryTrayEntry>;
}

export interface ReelsMediaResponse {
  reels_media: Array<StoryReel>;
}

export interface InstagramClientResponse<T> {
  headers: Record<string, string>;
  json: () => T;
  ok: boolean;
  status: number;
}

export interface InstagramClient {
  getReelsMedia: (reelIds: Array<string>) => Promise<InstagramClientResponse<ReelsMediaResponse>>;
  getTray: () => Promise<InstagramClientResponse<ReelTrayResponse>>;
  getMusicAsset?: (audioId: string) => Promise<InstagramClientResponse<JsonValue>>;
  getPlace?: (placeId: string) => Promise<InstagramClientResponse<JsonValue>>;
}
