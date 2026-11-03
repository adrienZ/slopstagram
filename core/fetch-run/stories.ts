import type { StoryRepository } from "@@/core/database/repositories/story-repository.ts";
import type { Runtime } from "@@/core/runtime/runtime.ts";
import type { Logger } from "@@/core/utils/logging.ts";
import {
  closeInstagramSession,
  openInstagramSession,
} from "@@/core/instagram/playwright-session.ts";
import type { StoriesManifestReport, StoryManifestReel } from "@@/core/fetch-run/report-types.ts";
import type {
  StoryTrayEntry,
  InstagramClient,
  ReelTrayResponse,
} from "@@/core/instagram/instagram-types.ts";
import { createInstagramClient } from "@@/core/instagram/story-client.ts";
import { enrichCurrentMusicAssets } from "@@/core/music/music-asset-enrichment.ts";
import { lookUpTaggedPlaces } from "@@/core/places/place-lookup.ts";
import { createFetchState } from "./story-failure.ts";
import { fetchMissingStories } from "./story-live-fetch.ts";
import { createManifestUsers, createOutputUsers } from "./story-output.ts";
import { requestWithRetry, sleep } from "@@/core/instagram/story-retry.ts";

type FetchStoriesRuntime = Pick<Runtime, "logger" | "storage"> & {
  stories: Pick<
    StoryRepository,
    "findByMediaPk" | "recordFailedPlaceLookup" | "recordPlaceLookup" | "refreshMusicAsset" | "save"
  >;
};

export interface FetchStoriesManifestOptions {
  baseDelayMs?: number;
  maxAttempts?: number;
  maxRateLimitDelayMs?: number;
  now?: () => Date;
  random?: () => number;
  reelIdsPerRequest?: number;
  reportName?: string;
  sleep?: (durationMs: number) => Promise<void>;
}

export type FetchStoriesOptions = FetchStoriesManifestOptions & {
  closeSession?: typeof closeInstagramSession;
  openSession?: typeof openInstagramSession;
};

const DEFAULT_REPORT_NAME = "stories-report.json";
const DEFAULT_REEL_IDS_PER_REQUEST = 25;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_RATE_LIMIT_DELAY_MS = 10_000;
function createRetryOptions(options: FetchStoriesManifestOptions, logger: Logger) {
  return {
    baseDelayMs: options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    logger,
    maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    maxRateLimitDelayMs: options.maxRateLimitDelayMs ?? DEFAULT_MAX_RATE_LIMIT_DELAY_MS,
    now: options.now ?? (() => new Date()),
    random: options.random ?? Math.random,
    sleep: options.sleep ?? sleep,
  };
}

function createReportMetadata(
  trayJson: ReelTrayResponse,
  options: {
    reportName: string;
    createdAt: string;
    state: ReturnType<typeof createFetchState>;
  },
): StoriesManifestReport["metadata"] {
  const { expectedMediaPks, fetchedMediaPks, failureByMediaPk } = options.state;

  return {
    broadcasts_count: trayJson.broadcasts.length,
    counts: {
      failed: expectedMediaPks.filter((mediaPk) => failureByMediaPk.has(mediaPk)).length,
      fetched: expectedMediaPks.filter((mediaPk) => fetchedMediaPks.has(mediaPk)).length,
      reels: trayJson.tray.length,
      stories: expectedMediaPks.length,
    },
    created_at: options.createdAt,
    report_name: options.reportName,
    status: trayJson.status,
    story_ranking_token: trayJson.story_ranking_token,
  };
}

function createStoriesReport(options: {
  manifestUsers: Array<StoryManifestReel>;
  reportName: string;
  state: ReturnType<typeof createFetchState>;
  trayJson: ReelTrayResponse;
  createdAt: string;
}): StoriesManifestReport {
  return {
    failures: options.state.failures,
    manifest: {
      users: options.manifestUsers,
    },
    metadata: createReportMetadata(options.trayJson, {
      createdAt: options.createdAt,
      reportName: options.reportName,
      state: options.state,
    }),
    output: {
      users: createOutputUsers(options.manifestUsers),
    },
  };
}

async function fetchTray(
  client: InstagramClient,
  options: FetchStoriesManifestOptions,
  logger: Logger,
) {
  const trayResult = await requestWithRetry(
    async () => await client.getTray(),
    createRetryOptions(options, logger),
    "reels tray request",
  );

  if (!trayResult.ok) {
    logger.error(`tray fetch failed: ${trayResult.failure.message}`);
    throw new Error(trayResult.failure.message);
  }

  return trayResult.value;
}

async function fetchMissingStoriesForReport(
  runtime: FetchStoriesRuntime,
  options: {
    client: InstagramClient;
    manifestOptions: FetchStoriesManifestOptions;
    now: () => Date;
    state: ReturnType<typeof createFetchState>;
    tray: Array<StoryTrayEntry>;
  },
): Promise<void> {
  await fetchMissingStories(
    runtime,
    {
      client: options.client,
      state: options.state,
      trayReelIds: options.tray.map((entry) => entry.id),
    },
    {
      reelIdsPerRequest: options.manifestOptions.reelIdsPerRequest ?? DEFAULT_REEL_IDS_PER_REQUEST,
      retryOptions: createRetryOptions(
        { ...options.manifestOptions, now: options.now },
        runtime.logger,
      ),
    },
  );
}

export async function fetchStoriesManifest(
  runtime: FetchStoriesRuntime,
  client: InstagramClient,
  options: FetchStoriesManifestOptions = {},
): Promise<StoriesManifestReport> {
  const reportName = options.reportName ?? DEFAULT_REPORT_NAME;
  const now = options.now ?? (() => new Date());
  const { logger } = runtime;

  logger.info(`fetching tray for report ${reportName}`);
  const trayJson = await fetchTray(client, { ...options, now }, logger);
  const state = createFetchState(trayJson.tray);

  logger.info(
    `tray fetched: reels=${trayJson.tray.length} stories=${state.expectedMediaPks.length} status=${trayJson.status}`,
  );
  await fetchMissingStoriesForReport(runtime, {
    client,
    manifestOptions: options,
    now,
    state,
    tray: trayJson.tray,
  });

  await enrichCurrentMusicAssets(runtime, client, state.cachedItems.values());
  await lookUpTaggedPlaces(runtime, client, state.fetchedMediaPks, { now });

  const manifestUsers = createManifestUsers(
    trayJson.tray,
    state.cachedItems,
    state.failureByMediaPk,
  );
  logger.info(
    `manifest complete: fetched=${state.fetchedMediaPks.size} failed=${state.failureByMediaPk.size}`,
  );

  return createStoriesReport({
    createdAt: now().toISOString(),
    manifestUsers,
    reportName,
    state,
    trayJson,
  });
}

export async function fetchStories(
  runtime: FetchStoriesRuntime & Pick<Runtime, "client">,
  options: FetchStoriesOptions = {},
): Promise<StoriesManifestReport> {
  const reportName = options.reportName ?? DEFAULT_REPORT_NAME;

  if (runtime.client) {
    return await fetchStoriesManifest(runtime, runtime.client, {
      ...options,
      reportName,
    });
  }

  const openSession = options.openSession ?? openInstagramSession;
  const closeSession = options.closeSession ?? closeInstagramSession;
  const session = await openSession();

  try {
    return await fetchStoriesManifest(runtime, createInstagramClient(session), {
      ...options,
      reportName,
    });
  } finally {
    await closeSession(session);
  }
}
