import type { closeInstagramSession, openInstagramSession } from "./lib/playwright-service.ts";
import type { Logger } from "./lib/logging-service.ts";
import type { StoryItem, StoryStorage, StoryTrayEntry } from "./lib/types.ts";
import type { ReelsMediaResponse } from "./story-client-service.ts";

export type ReelTrayResponse = {
  broadcasts: unknown[];
  story_ranking_token: string;
  status: string;
  tray: StoryTrayEntry[];
};

export type InstagramClientResponse<T> = {
  headers: Record<string, string>;
  json: () => Promise<T>;
  ok: boolean;
  status: number;
};

export type InstagramClient = {
  getReelsMedia: (reelIds: string[]) => Promise<InstagramClientResponse<ReelsMediaResponse>>;
  getTray: () => Promise<InstagramClientResponse<ReelTrayResponse>>;
};

export type FetchStoriesManifestOptions = {
  appleCaptionResolver?: (story: StoryItem) => Promise<string>;
  baseDelayMs?: number;
  maxAttempts?: number;
  maxRateLimitDelayMs?: number;
  now?: () => Date;
  random?: () => number;
  reelIdsPerRequest?: number;
  reportName?: string;
  logger?: Logger;
  sleep?: (durationMs: number) => Promise<void>;
  storyStorage?: StoryStorage;
};

export type FetchStoriesOptions = FetchStoriesManifestOptions & {
  client?: InstagramClient;
  closeSession?: typeof closeInstagramSession;
  openSession?: typeof openInstagramSession;
};
