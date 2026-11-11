import type { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import {
  closeInstagramSession,
  openInstagramSession,
} from "@@/core/domains/instagram/playwright-session.ts";
import type {
  StoriesManifestReport,
  StoryManifestReel,
} from "@@/core/domains/fetch-run/report-types.ts";
import type {
  InstagramClient,
  ReelTrayResponse,
} from "@@/core/domains/instagram/instagram-types.ts";
import { createInstagramClient } from "@@/core/domains/instagram/story-client.ts";
import { enrichCurrentMusicAssets } from "@@/core/domains/music/music-asset-enrichment.ts";
import { lookUpTaggedPlaces } from "@@/core/domains/places/place-lookup.ts";
import { createFetchState } from "./story-failure.ts";
import { fetchMissingStories } from "./story-live-fetch.ts";
import { createManifestUsers, createOutputUsers } from "./story-output.ts";
import { requestWithRetry, type RetryOptions } from "@@/core/domains/instagram/story-retry.ts";

type FetchStoriesRuntime = Pick<Runtime, "logger" | "storage"> & {
  stories: Pick<StoryRepository, "findByMediaPk" | "save"> &
    Partial<
      Pick<StoryRepository, "recordFailedPlaceLookup" | "recordPlaceLookup" | "refreshMusicAsset">
    >;
};

interface FetchStoriesOptions {
  maxAttempts?: number;
  now?: () => Date;
  reelIdsPerRequest?: number;
  reportName?: string;
}

const DEFAULT_REPORT_NAME = "stories-report.json";
const DEFAULT_REEL_IDS_PER_REQUEST = 25;
const DEFAULT_MAX_ATTEMPTS = 3;

function createRetryOptions(
  runtime: FetchStoriesRuntime,
  options: FetchStoriesOptions,
  now: () => Date,
): RetryOptions {
  return {
    logger: runtime.logger,
    maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    now,
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

async function fetchTray(client: InstagramClient, retryOptions: RetryOptions) {
  const trayResult = await requestWithRetry(
    async () => await client.getTray(),
    retryOptions,
    "reels tray request",
  );

  if (!trayResult.ok) {
    retryOptions.logger.error(`tray fetch failed: ${trayResult.failure.message}`);
    throw new Error(trayResult.failure.message);
  }

  return trayResult.value;
}

export async function fetchStoriesManifest(
  runtime: FetchStoriesRuntime,
  client: InstagramClient,
  options: FetchStoriesOptions = {},
): Promise<StoriesManifestReport> {
  const reportName = options.reportName ?? DEFAULT_REPORT_NAME;
  const now = options.now ?? (() => new Date());
  const retryOptions = createRetryOptions(runtime, options, now);
  const { logger } = runtime;

  logger.info(`fetching tray for report ${reportName}`);
  const trayJson = await fetchTray(client, retryOptions);
  const state = createFetchState(trayJson.tray);

  logger.info(
    `tray fetched: reels=${trayJson.tray.length} stories=${state.expectedMediaPks.length} status=${trayJson.status}`,
  );
  await fetchMissingStories(
    runtime,
    { client, state, trayReelIds: trayJson.tray.map((entry) => entry.id) },
    {
      reelIdsPerRequest: options.reelIdsPerRequest ?? DEFAULT_REEL_IDS_PER_REQUEST,
      retryOptions,
    },
  );

  await enrichCurrentMusicAssets(client, state.cachedItems.values(), runtime.stories, logger);
  await lookUpTaggedPlaces(client, state.fetchedMediaPks, runtime.stories, logger, now);

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
  if (runtime.client) {
    return await fetchStoriesManifest(runtime, runtime.client, options);
  }

  const session = await openInstagramSession();

  try {
    return await fetchStoriesManifest(runtime, createInstagramClient(session), options);
  } finally {
    await closeInstagramSession(session);
  }
}
