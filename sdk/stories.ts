import { storiesStorage, type StoryStorage } from "./lib/cache-service.ts";
import { storyRepository, type StoryRepository } from "./repositories/story-repository.ts";
import { type Logger, createLogger } from "./lib/logging-service.ts";
import { closeInstagramSession, openInstagramSession } from "./lib/playwright-service.ts";
import type { StoriesManifestReport, StoryManifestReel } from "./report-types.ts";
import type { StoryTrayEntry, InstagramClient, ReelTrayResponse } from "./instagram-types.ts";
import { createInstagramClient } from "./story-client-service.ts";
import { enrichCurrentMusicAssets } from "./music-asset-enrichment.ts";
import { lookUpTaggedPlaces } from "./place-lookup.ts";
import { createFetchState } from "./story-failure-service.ts";
import { fetchMissingStories } from "./story-live-fetch-service.ts";
import { createManifestUsers, createOutputUsers } from "./story-output-service.ts";
import { requestWithRetry, sleep } from "./story-retry-service.ts";

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
    Partial<
      Pick<StoryRepository, "recordFailedPlaceLookup" | "recordPlaceLookup" | "refreshMusicAsset">
    >;
  storyStorage?: StoryStorage;
}

export type FetchStoriesOptions = FetchStoriesManifestOptions & {
  client?: InstagramClient;
  closeSession?: typeof closeInstagramSession;
  openSession?: typeof openInstagramSession;
};

const DEFAULT_REPORT_NAME = "stories-report.json";
const DEFAULT_REEL_IDS_PER_REQUEST = 25;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_RATE_LIMIT_DELAY_MS = 10_000;
function getArgValue(args: Array<string>, flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

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
  const { expectedMediaPks, cacheHitPks, fetchedMediaPks, failureByMediaPk } = options.state;

  return {
    broadcasts_count: trayJson.broadcasts.length,
    counts: {
      cache_hits: expectedMediaPks.filter((mediaPk) => cacheHitPks.has(mediaPk)).length,
      cache_misses: expectedMediaPks.filter((mediaPk) => !cacheHitPks.has(mediaPk)).length,
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

async function fetchMissingStoriesForReport(options: {
  client: InstagramClient;
  logger: Logger;
  manifestOptions: FetchStoriesManifestOptions;
  now: () => Date;
  state: ReturnType<typeof createFetchState>;
  storyRepository: Pick<StoryRepository, "findByMediaPk" | "save">;
  storyStorage: StoryStorage;
  tray: Array<StoryTrayEntry>;
}): Promise<void> {
  await fetchMissingStories({
    client: options.client,
    logger: options.logger,
    reelIdsPerRequest: options.manifestOptions.reelIdsPerRequest ?? DEFAULT_REEL_IDS_PER_REQUEST,
    retryOptions: createRetryOptions(
      { ...options.manifestOptions, now: options.now },
      options.logger,
    ),
    state: options.state,
    storyRepository: options.storyRepository,
    storyStorage: options.storyStorage,
    trayReelIds: options.tray.map((entry) => entry.id),
  });
}

export async function fetchStoriesManifest(
  client: InstagramClient,
  options: FetchStoriesManifestOptions = {},
): Promise<StoriesManifestReport> {
  const reportName = options.reportName ?? DEFAULT_REPORT_NAME;
  const storage = options.storyStorage ?? storiesStorage;
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? createLogger("fetch-stories");

  logger.info(`fetching tray for report ${reportName}`);
  const trayJson = await fetchTray(client, { ...options, now }, logger);
  const state = createFetchState(trayJson.tray);

  logger.info(
    `tray fetched: reels=${trayJson.tray.length} stories=${state.expectedMediaPks.length} status=${trayJson.status}`,
  );
  const repository = options.storyRepository ?? storyRepository;
  await fetchMissingStoriesForReport({
    client,
    logger,
    manifestOptions: options,
    now,
    state,
    storyRepository: repository,
    storyStorage: storage,
    tray: trayJson.tray,
  });

  await enrichCurrentMusicAssets(client, state.cachedItems.values(), repository, logger);
  await lookUpTaggedPlaces(client, state.fetchedMediaPks, repository, logger, now);

  const manifestUsers = createManifestUsers(
    trayJson.tray,
    state.cachedItems,
    state.failureByMediaPk,
  );
  logger.info(
    `manifest complete: cached=${state.cacheHitPks.size} fetched=${state.fetchedMediaPks.size} failed=${state.failureByMediaPk.size}`,
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
  args: Array<string> = [],
  options: FetchStoriesOptions = {},
): Promise<StoriesManifestReport> {
  const reportName =
    options.reportName ?? getArgValue(args, "--report-name") ?? DEFAULT_REPORT_NAME;

  if (options.client) {
    return await fetchStoriesManifest(options.client, {
      ...options,
      reportName,
    });
  }

  const openSession = options.openSession ?? openInstagramSession;
  const closeSession = options.closeSession ?? closeInstagramSession;
  const session = await openSession();

  try {
    return await fetchStoriesManifest(createInstagramClient(session), {
      ...options,
      reportName,
    });
  } finally {
    await closeSession(session);
  }
}
