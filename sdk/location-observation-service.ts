import { isJsonObject, type JsonObject, type JsonValue } from "./lib/json-value.ts";
import type { LocationFields } from "./entities/location-metadata.ts";
import type { StoryItem } from "./lib/types.ts";
import { getProviderIdentifier } from "./lib/provider-identifier.ts";
import { z } from "zod";

const ReceivedTextSchema = z.string().refine((value) => value.trim().length > 0);

function receivedText(record: JsonObject, keys: Array<string>): string | null {
  for (const key of keys) {
    const parsed = ReceivedTextSchema.safeParse(record[key]);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}

function coordinate(record: JsonObject, keys: Array<string>, bound: number): number | null {
  for (const key of keys) {
    const parsed = z.number().min(-bound).max(bound).safeParse(record[key]);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}

export function findLocationRecord(value: JsonValue | undefined): JsonObject | null {
  if (value === undefined || !isJsonObject(value)) {
    return null;
  }
  for (const key of [
    "location",
    "venue",
    "place",
    "story_location",
    "location_sticker",
    "bloks_sticker",
    "sticker_data",
  ]) {
    const nested = findLocationRecord(value[key]);
    if (nested) {
      return nested;
    }
  }
  // The outer ID is an occurrence identifier; callers start at a location
  // container, never at the outer sticker, when inspecting identifier-only data.
  return [
    "pk",
    "id",
    "name",
    "location_name",
    "title",
    "address",
    "full_address",
    "street_address",
    "subtitle",
    "lat",
    "lng",
    "latitude",
    "longitude",
    "facebook_places_id",
    "external_source",
  ].some((key) => Object.hasOwn(value, key))
    ? value
    : null;
}

export interface LocationObservationInput {
  providerOccurrenceId: string | null;
  fields: LocationFields;
}

export function getLocationObservation(value: JsonValue): LocationObservationInput | null {
  if (!isJsonObject(value)) {
    return null;
  }
  const container =
    value.location ??
    value.venue ??
    value.place ??
    value.story_location ??
    value.location_sticker ??
    value.bloks_sticker;
  const directPlace = [
    "pk",
    "name",
    "location_name",
    "title",
    "address",
    "full_address",
    "street_address",
    "subtitle",
    "lat",
    "lng",
    "latitude",
    "longitude",
    "facebook_places_id",
    "external_source",
  ].some((key) => Object.hasOwn(value, key));
  const record = findLocationRecord(container ?? (directPlace ? value : undefined));
  if (!record) {
    return null;
  }
  const fields: LocationFields = {
    instagramPlaceId: getProviderIdentifier(record.pk ?? record.id),
    name: receivedText(record, ["name", "location_name", "title"]),
    address: receivedText(record, ["address", "full_address", "street_address", "subtitle"]),
    city: receivedText(record, ["city"]),
    latitude: coordinate(record, ["lat", "latitude"], 90),
    longitude: coordinate(record, ["lng", "longitude"], 180),
    facebookPlacesId: getProviderIdentifier(record.facebook_places_id),
    externalSource: receivedText(record, ["external_source"]),
  };
  return Object.values(fields).some((field) => field !== null)
    ? { providerOccurrenceId: getProviderIdentifier(value.id), fields }
    : null;
}

export function getLocationSourceUpdates(
  story: StoryItem,
): Array<{ source: string; observations: Array<LocationObservationInput> }> {
  const updates = [];
  for (const source of ["story_locations", "story_bloks_stickers"] as const) {
    const values = story[source];
    if (!Array.isArray(values)) {
      continue;
    }
    const observations: Array<LocationObservationInput> = [];
    let malformed = false;
    for (const value of values) {
      if (
        source === "story_bloks_stickers" &&
        isJsonObject(value) &&
        isJsonObject(value.bloks_sticker) &&
        isJsonObject(value.bloks_sticker.sticker_data)
      ) {
        const data = value.bloks_sticker.sticker_data;
        if (
          Object.hasOwn(data, "ig_mention") &&
          (!isJsonObject(data.ig_mention) ||
            receivedText(data.ig_mention, ["username", "full_name"]) === null)
        ) {
          malformed = true;
        }
      }
      const observation = getLocationObservation(value);
      if (observation) {
        observations.push(observation);
      } else if (source === "story_locations") {
        malformed = true;
      } else if (
        !isJsonObject(value) ||
        !isJsonObject(value.bloks_sticker) ||
        !isJsonObject(value.bloks_sticker.sticker_data) ||
        Object.keys(value.bloks_sticker.sticker_data).length === 0 ||
        Object.hasOwn(value.bloks_sticker.sticker_data, "location")
      ) {
        malformed = true;
      }
    }
    if (!malformed) {
      updates.push({ source, observations });
    }
  }
  return updates;
}
