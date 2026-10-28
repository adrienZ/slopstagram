import type { Logger } from "./lib/logging-service.ts";
import { isLookupPlaceId, lookUpTaggedPlaces } from "./place-lookup.ts";
import type { StoryRepository } from "./repositories/story-repository.ts";
import type { InstagramClient } from "./story-types.ts";

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

export interface PlaceBackfillOptions {
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
