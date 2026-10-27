import { z } from "zod";
import type { JsonValue } from "./lib/json-value.ts";
import type { Logger } from "./lib/logging-service.ts";
import type { PlaceLookupInput } from "./location-metadata-service.ts";
import type { InstagramClient, FetchStoriesManifestOptions } from "./story-types.ts";

// Story payloads also carry non-place identifiers, such as the generic bloks sticker one.
const NUMERIC_PLACE_ID = /^\d+$/u;

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

function parsePlaceResponse(body: JsonValue, placeId: string): PlaceLookupInput | null {
  const parsed = responseSchema.safeParse(body);
  const info = parsed.success
    ? parsed.data.data.xdt_location_get_web_info.native_location_data.location_info
    : null;
  if (info === null || info.location_id !== placeId) {
    return null;
  }
  return {
    name: info.name,
    address: info.location_address,
    city: info.location_city,
    zip: info.location_zip,
    latitude: info.lat,
    longitude: info.lng,
    category: info.category,
    details: parseDetails(info),
  };
}

function listPlacesToLookUp(
  mediaPks: Iterable<string>,
  repository: NonNullable<FetchStoriesManifestOptions["storyRepository"]>,
) {
  const placeIds = new Set<string>();
  for (const mediaPk of mediaPks) {
    for (const { metadata } of repository.findByMediaPk(mediaPk)?.annotations
      ?.locationObservations ?? []) {
      if (
        metadata.instagramPlaceId !== null &&
        NUMERIC_PLACE_ID.test(metadata.instagramPlaceId) &&
        metadata.lastLookupAttemptAt === null
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
  if (client.getPlace === undefined || repository?.recordPlaceLookup === undefined) {
    return;
  }
  for (const placeId of listPlacesToLookUp(savedMediaPks, repository)) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- Keep requests sequential and stop on rate limits.
      const response = await client.getPlace(placeId);
      if (response.status === 429 || response.status === 401 || response.status === 403) {
        logger.warn(`place lookup stopped after Instagram HTTP ${response.status}`);
        return;
      }
      const place = response.ok ? parsePlaceResponse(response.json(), placeId) : null;
      if (place !== null) {
        repository.recordPlaceLookup(placeId, place, now());
      }
    } catch {
      logger.warn("place lookup failed; continuing story ingestion");
    }
  }
}
