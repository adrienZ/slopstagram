import type { closeInstagramSession, openInstagramSession } from "./lib/playwright-service.ts";
import type { Logger } from "./lib/logging-service.ts";
import type { StoryRepository } from "./entities/story.ts";
import type { StoryStorage, StoryTrayEntry } from "./lib/types.ts";
import type { ReelsMediaResponse } from "./story-client-service.ts";

export interface ReelTrayResponse {
  broadcasts: Array<unknown>;
  story_ranking_token: string;
  status: string;
  tray: Array<StoryTrayEntry>;
}

export interface InstagramClientResponse<T> {
  headers: Record<string, string>;
  json: () => Promise<T>;
  ok: boolean;
  status: number;
}

export interface InstagramClient {
  getReelsMedia: (reelIds: Array<string>) => Promise<InstagramClientResponse<ReelsMediaResponse>>;
  getTray: () => Promise<InstagramClientResponse<ReelTrayResponse>>;
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
  storyRepository?: Pick<StoryRepository, "save">;
  storyStorage?: StoryStorage;
}

export type FetchStoriesOptions = FetchStoriesManifestOptions & {
  client?: InstagramClient;
  closeSession?: typeof closeInstagramSession;
  openSession?: typeof openInstagramSession;
};
