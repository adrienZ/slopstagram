import { z } from "zod";
import type { JsonValue } from "./lib/json-value.ts";
import type { StoryLocationObservation } from "./entities/location-metadata.ts";
import type { Logger } from "./lib/logging-service.ts";
import type { PlaceLookupInput } from "./location-metadata-service.ts";
import type { InstagramClient, FetchStoriesManifestOptions } from "./story-types.ts";

// Story payloads also carry non-place identifiers, such as the generic bloks sticker one.
const NUMERIC_PLACE_ID = /^\d+$/u;

export function isLookupPlaceId(placeId: string) {
  return NUMERIC_PLACE_ID.test(placeId);
}

const locationInfoSchema = z.looseObject({
  location_id: z.string(),
  name: z.string().nullish(),
  location_address: z.string().nullish(),
  location_city: z.string().nullish(),
  location_zip: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  category: z.string().nullish(),
});

const graphQlErrorsSchema = z.object({ errors: z.array(z.unknown()).min(1) });

const responseSchema = z.object({
  data: z.object({
    xdt_location_get_web_info: z.object({
      native_location_data: z.object({
        location_info: locationInfoSchema.nullable(),
      }),
    }),
  }),
});

// Parsed apart from the place itself so a malformed detail never blocks filling the place.
const detailsSchema = z.object({
  phone: z.string().nullish(),
  price_range: z.number().int().nullish(),
  slug: z.string().nullish(),
  ig_business: z
    .object({
      profile: z
        .object({
          id: z.string().nullish(),
          username: z.string().nullish(),
          profile_pic_url: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

function parseDetails(info: z.infer<typeof locationInfoSchema>): PlaceLookupInput["details"] {
  const parsed = detailsSchema.safeParse(info);
  if (!parsed.success) {
    return undefined;
  }
  const { phone, price_range: priceRange, slug, ig_business: business } = parsed.data;
  return {
    phone,
    priceRange,
    slug,
    business: {
      id: business?.profile?.id,
      username: business?.profile?.username,
      pictureUrl: business?.profile?.profile_pic_url,
    },
  };
}

type PlaceResponseResult = { place: PlaceLookupInput } | { failure: string };

function parsePlaceResponse(body: JsonValue, placeId: string): PlaceResponseResult {
  const graphQlErrors = graphQlErrorsSchema.safeParse(body);
  if (graphQlErrors.success) {
    return {
      failure: `Instagram returned GraphQL errors: ${JSON.stringify(graphQlErrors.data.errors)}`,
    };
  }
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    return { failure: `Instagram returned an invalid place response: ${parsed.error.message}` };
  }
  const info = parsed.data.data.xdt_location_get_web_info.native_location_data.location_info;
  if (info === null || info.location_id !== placeId) {
    return { failure: `Instagram returned no place data for ${placeId}` };
  }
  return {
    place: {
      name: info.name,
      address: info.location_address,
      city: info.location_city,
      zip: info.location_zip,
      latitude: info.lat,
      longitude: info.lng,
      category: info.category,
      details: parseDetails(info),
    },
  };
}

const RETRY_FAILED_LOOKUP_AFTER_MS = 12 * 60 * 60 * 1000;

function needsLookup(metadata: StoryLocationObservation["metadata"], now: Date) {
  if (metadata.lastLookupAttemptAt === null) {
    return true;
  }
  return (
    metadata.lastLookupFailure !== null &&
    now.getTime() - metadata.lastLookupAttemptAt >= RETRY_FAILED_LOOKUP_AFTER_MS
  );
}

function listPlacesToLookUp(
  mediaPks: Iterable<string>,
  repository: NonNullable<FetchStoriesManifestOptions["storyRepository"]>,
  now: Date,
) {
  const placeIds = new Set<string>();
  for (const mediaPk of mediaPks) {
    for (const { metadata } of repository.findByMediaPk(mediaPk)?.annotations
      ?.locationObservations ?? []) {
      if (
        metadata.instagramPlaceId !== null &&
        isLookupPlaceId(metadata.instagramPlaceId) &&
        needsLookup(metadata, now)
      ) {
        placeIds.add(metadata.instagramPlaceId);
      }
    }
  }
  return placeIds;
}

export async function lookUpTaggedPlaces(
  client: Pick<InstagramClient, "getPlace">,
  savedMediaPks: Iterable<string>,
  repository: FetchStoriesManifestOptions["storyRepository"],
  logger: Pick<Logger, "warn">,
  now: () => Date,
) {
  if (
    client.getPlace === undefined ||
    repository?.recordPlaceLookup === undefined ||
    repository.recordFailedPlaceLookup === undefined
  ) {
    return;
  }
  for (const placeId of listPlacesToLookUp(savedMediaPks, repository, now())) {
    let outcome: PlaceResponseResult;
    try {
      // oxlint-disable-next-line no-await-in-loop -- Keep requests sequential and stop on rate limits.
      const response = await client.getPlace(placeId);
      if (response.status === 429 || response.status === 401 || response.status === 403) {
        logger.warn(`place lookup stopped after Instagram HTTP ${response.status}`);
        return;
      }
      outcome = response.ok
        ? parsePlaceResponse(response.json(), placeId)
        : { failure: `Instagram answered HTTP ${response.status}` };
    } catch (error) {
      logger.warn("place lookup failed; continuing story ingestion");
      // Only the message is kept: an error object can carry request headers or cookies.
      outcome = { failure: error instanceof Error ? error.message : String(error) };
    }
    try {
      if ("place" in outcome) {
        repository.recordPlaceLookup(placeId, outcome.place, now());
      } else {
        repository.recordFailedPlaceLookup(placeId, outcome.failure, now());
      }
    } catch {
      logger.warn("place lookup could not be recorded; continuing story ingestion");
    }
  }
}
