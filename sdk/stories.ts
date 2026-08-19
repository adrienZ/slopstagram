import { storiesStorage } from "./lib/cache-service.ts";
import { storyRepository } from "./lib/entity-repository-service.ts";
import type { StoryRepository } from "./entities/story.ts";
import type { Logger } from "./lib/logging-service.ts";
import { createLogger } from "./lib/logging-service.ts";
import { closeInstagramSession, openInstagramSession } from "./lib/playwright-service.ts";
import type {
  StoriesManifestReport,
  StoryManifestReel,
  StoryStorage,
  StoryTrayEntry,
} from "./lib/types.ts";
import { createInstagramClient } from "./story-client-service.ts";
import { createFetchState } from "./story-failure-service.ts";
import { fetchMissingStories } from "./story-live-fetch-service.ts";
import { createManifestUsers, createOutputUsers } from "./story-output-service.ts";
import { requestWithRetry, sleep } from "./story-retry-service.ts";
import type {
  FetchStoriesManifestOptions,
  FetchStoriesOptions,
  InstagramClient,
  ReelTrayResponse,
} from "./story-types.ts";

export type {
  FetchStoriesManifestOptions,
  FetchStoriesOptions,
  InstagramClient,
  InstagramClientResponse,
} from "./story-types.ts";

const DEFAULT_REPORT_NAME = "stories-report.json";
const DEFAULT_REEL_IDS_PER_REQUEST = 25;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_RATE_LIMIT_DELAY_MS = 10_000;
function getArgValue(args: string[], flag: string): string | undefined {
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
  manifestUsers: StoryManifestReel[];
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
    () => client.getTray(),
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
  storyRepository: Pick<StoryRepository, "save">;
  storyStorage: StoryStorage;
  tray: StoryTrayEntry[];
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
  await fetchMissingStoriesForReport({
    client,
    logger,
    manifestOptions: options,
    now,
    state,
    storyRepository: options.storyRepository ?? storyRepository,
    storyStorage: storage,
    tray: trayJson.tray,
  });

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
  args: string[] = [],
  options: FetchStoriesOptions = {},
): Promise<StoriesManifestReport> {
  const reportName =
    options.reportName ?? getArgValue(args, "--report-name") ?? DEFAULT_REPORT_NAME;

  if (options.client) {
    return fetchStoriesManifest(options.client, {
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
