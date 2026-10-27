import type { closeInstagramSession, openInstagramSession } from "./lib/playwright-service.ts";
import type { Logger } from "./lib/logging-service.ts";
import type { StoryRepository } from "./repositories/story-repository.ts";
import type { StoryStorage, StoryTrayEntry } from "./lib/types.ts";
import type { ReelsMediaResponse } from "./story-client-service.ts";
import type { JsonValue } from "./lib/json-value.ts";

export interface ReelTrayResponse {
  broadcasts: Array<unknown>;
  story_ranking_token: string;
  status: string;
  tray: Array<StoryTrayEntry>;
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

export interface FetchStoriesManifestOptions {
  baseDelayMs?: number;
  maxAttempts?: number;
  maxRateLimitDelayMs?: number;
  now?: () => Date;
  random?: () => number;
  reelIdsPerRequest?: number;
  reportName?: string;
  logger?: Logger;
  sleep?: (durationMs: number) => Promise<void>;
  storyRepository?: Pick<StoryRepository, "findByMediaPk" | "save"> &
    Partial<Pick<StoryRepository, "recordPlaceLookup" | "refreshMusicAsset">>;
  storyStorage?: StoryStorage;
}

export type FetchStoriesOptions = FetchStoriesManifestOptions & {
  client?: InstagramClient;
  closeSession?: typeof closeInstagramSession;
  openSession?: typeof openInstagramSession;
};
