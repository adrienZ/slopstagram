import process from "node:process";
import { pathToFileURL } from "node:url";
import { APP_DATABASE_PATH } from "../sdk/lib/app-data-paths.ts";
import { createLogger, type Logger } from "../sdk/lib/logging-service.ts";
import { closeInstagramSession, openInstagramSession } from "../sdk/lib/playwright-service.ts";
import { isLookupPlaceId, lookUpTaggedPlaces } from "../sdk/place-lookup.ts";
import { storyRepository, type StoryRepository } from "../sdk/repositories/story-repository.ts";
import { createInstagramClient } from "../sdk/story-client-service.ts";
import { sleep } from "../sdk/story-retry-service.ts";
import type { InstagramClient } from "../sdk/story-types.ts";

const DEFAULT_PAUSE_MS = 1500;

interface PlaceToBackfill {
  instagramPlaceId: string;
  mediaPk: string;
}

// A migration dated places stored before lookups existed by their earliest story, in
// milliseconds. A real lookup is dated by the clock, so only the former match exactly.
export function listPlacesToBackfill(
  repository: Pick<StoryRepository, "findPlaceLookupHistory">,
  limit = Number.POSITIVE_INFINITY,
): Array<PlaceToBackfill> {
  const earliest = new Map<
    string,
    { mediaPk: string; takenAt: number; lastLookupAttemptAt: number }
  >();
  for (const row of repository.findPlaceLookupHistory()) {
    const { instagramPlaceId, lastLookupAttemptAt, mediaPk, takenAt } = row;
    if (instagramPlaceId === null || lastLookupAttemptAt === null || takenAt === null) {
      continue;
    }
    const known = earliest.get(instagramPlaceId);
    if (known === undefined || takenAt < known.takenAt) {
      earliest.set(instagramPlaceId, { mediaPk, takenAt, lastLookupAttemptAt });
    }
  }
  return [...earliest]
    .filter(
      ([instagramPlaceId, { lastLookupAttemptAt, takenAt }]) =>
        isLookupPlaceId(instagramPlaceId) && lastLookupAttemptAt === takenAt * 1000,
    )
    .map(([instagramPlaceId, { mediaPk }]) => ({ instagramPlaceId, mediaPk }))
    .toSorted((a, b) => a.instagramPlaceId.localeCompare(b.instagramPlaceId))
    .slice(0, limit);
}

interface PlaceBackfillOptions {
  limit?: number;
  pauseMs: number;
  sleep: (durationMs: number) => Promise<void>;
  now: () => Date;
}

// Forgets the dated attempts of the selected places, then runs the regular lookup on the
// stories that reference them, one request at a time with a pause between requests.
export async function backfillPlaceLookups(
  client: Pick<InstagramClient, "getPlace">,
  repository: StoryRepository,
  logger: Pick<Logger, "warn">,
  options: PlaceBackfillOptions,
) {
  const { getPlace } = client;
  if (getPlace === undefined) {
    return 0;
  }
  const places = listPlacesToBackfill(repository, options.limit);
  repository.forgetPlaceLookupAttempts(places.map(({ instagramPlaceId }) => instagramPlaceId));
  let requested = 0;
  const throttled: Pick<InstagramClient, "getPlace"> = {
    async getPlace(placeId) {
      if (requested > 0) {
        await options.sleep(options.pauseMs);
      }
      requested += 1;
      return await getPlace(placeId);
    },
  };
  await lookUpTaggedPlaces(
    throttled,
    places.map(({ mediaPk }) => mediaPk),
    repository,
    logger,
    options.now,
  );
  return places.length;
}

function readOption(name: string): number | undefined {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : Number(process.argv[index + 1]);
  if (value !== undefined && !Number.isInteger(value)) {
    throw new TypeError(`${name} expects a whole number`);
  }
  return value;
}

async function main(): Promise<void> {
  const limit = readOption("--limit");
  const pauseMs = readOption("--pause-ms") ?? DEFAULT_PAUSE_MS;
  const places = listPlacesToBackfill(storyRepository, limit);
  process.stdout.write(`database: ${APP_DATABASE_PATH}\n`);
  process.stdout.write(`${places.length} places to look up\n`);
  if (process.argv.includes("--dry-run")) {
    for (const { instagramPlaceId, mediaPk } of places) {
      process.stdout.write(`${instagramPlaceId} (story ${mediaPk})\n`);
    }
    return;
  }
  const session = await openInstagramSession();
  try {
    const count = await backfillPlaceLookups(
      createInstagramClient(session),
      storyRepository,
      createLogger("backfill-place-lookups"),
      { limit, pauseMs, sleep, now: () => new Date() },
    );
    process.stdout.write(`${count} places looked up\n`);
  } finally {
    await closeInstagramSession(session);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
