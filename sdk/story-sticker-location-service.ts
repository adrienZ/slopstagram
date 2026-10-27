import { URL } from "node:url";
import { z } from "zod";
import { isJsonObject, type JsonObject, type JsonValue } from "./lib/json-value.ts";
import type { StoryAnnotations, StoryItem } from "./lib/types.ts";
import { ProviderIdentifierSchema } from "./lib/provider-identifier.ts";
import { getMusicObservation, getMusicSourceUpdate } from "./music-observation-service.ts";
import {
  getLocationObservation,
  getLocationSourceUpdates,
} from "./location-observation-service.ts";

function getNestedRecord(value: JsonValue, key: string): JsonObject | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const nested = value[key];

  return isJsonObject(nested) ? nested : null;
}

function getNestedString(value: JsonValue, keys: ReadonlyArray<string>): string | null {
  if (!isJsonObject(value)) {
    return null;
  }

  for (const key of keys) {
    const candidate = value[key];
    const stringCandidate = z.string().safeParse(candidate);
    if (stringCandidate.success && stringCandidate.data.trim().length > 0) {
      return stringCandidate.data.trim();
    }
  }

  return null;
}

function getMentionStickerLabel(value: JsonValue): string | null {
  const stickerData = getNestedRecord(value, "bloks_sticker");
  const bloksData = stickerData ? getNestedRecord(stickerData, "sticker_data") : null;
  const mention = bloksData ? getNestedRecord(bloksData, "ig_mention") : null;

  if (mention === null) {
    return null;
  }

  const username = getNestedString(mention, ["username"]);
  if (username !== null && username.length > 0) {
    return `@${username}`;
  }

  const fullName = getNestedString(mention, ["full_name"]);
  return fullName !== null && fullName.length > 0 ? fullName : null;
}

function getMusicStickers(value: JsonValue): Array<Sticker> | null {
  const info = getNestedRecord(value, "music_asset_info");
  const title = getNestedString(info, ["title"]);
  const artist = getNestedString(info, ["display_artist"]);
  if (title !== null) {
    return [{ kind: "music", label: artist === null ? title : `${title} - ${artist}` }];
  }
  return getMusicObservation(value) === null ? null : [];
}

function getHashtagStickerLabel(value: JsonValue): string | null {
  const hashtag =
    getNestedString(value, ["hashtag", "name", "tag_name"]) ??
    getNestedString(getNestedRecord(value, "hashtag"), ["name", "tag_name"]);

  if (hashtag === null || hashtag.length === 0) {
    return null;
  }

  return hashtag.startsWith("#") ? hashtag : `#${hashtag}`;
}

function unwrapInstagramRedirectUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.hostname !== "l.instagram.com") {
      return value;
    }

    const redirect = url.searchParams.get("u");
    return redirect === null || redirect.length === 0 ? value : decodeURIComponent(redirect);
  } catch {
    return value;
  }
}

function getLinkStickerLabel(value: JsonValue, visited = new Set<JsonValue>()): string | null {
  if (visited.has(value)) {
    return null;
  }

  visited.add(value);
  const rawDirectUrl = getNestedString(value, ["url", "uri", "link_url", "webUri", "web_uri"]);
  const directUrl =
    rawDirectUrl !== null && rawDirectUrl.length > 0
      ? unwrapInstagramRedirectUrl(rawDirectUrl)
      : null;
  const directTitle = getNestedString(value, ["title", "link_title", "display_url"]);

  if (
    directUrl !== null &&
    directUrl.length > 0 &&
    directTitle !== null &&
    directTitle.length > 0
  ) {
    return `${directTitle} (${directUrl})`;
  }

  if (directUrl !== null && directUrl.length > 0) {
    return directUrl;
  }

  for (const key of [
    "story_link",
    "link_sticker",
    "link",
    "cta",
    "bloks_tappable_sticker",
  ] as const) {
    const nested = getNestedRecord(value, key);
    const nestedLabel = nested === null ? null : getLinkStickerLabel(nested, visited);

    if (nestedLabel !== null && nestedLabel.length > 0) {
      return nestedLabel;
    }
  }

  return directTitle !== null && directTitle.length > 0 ? directTitle : null;
}

function getLocationRecord(value: JsonValue, visited = new Set<JsonValue>()): JsonObject | null {
  if (!isJsonObject(value)) {
    return null;
  }

  if (visited.has(value)) {
    return null;
  }

  visited.add(value);

  const name = getNestedString(value, ["name", "location_name", "title"]);
  const address = getNestedString(value, ["address", "full_address", "street_address", "subtitle"]);

  if ((name !== null && name.length > 0) || (address !== null && address.length > 0)) {
    return value;
  }

  for (const key of [
    "location",
    "venue",
    "place",
    "story_location",
    "location_sticker",
    "bloks_sticker",
    "sticker_data",
  ] as const) {
    const nestedLocation = getLocationRecord(getNestedRecord(value, key), visited);

    if (nestedLocation) {
      return nestedLocation;
    }
  }

  return null;
}

function getLocationFromValue(value: JsonValue): { address: string; name: string } | null {
  const location = getLocationRecord(value);

  if (!location) {
    return null;
  }

  const name = getNestedString(location, ["name", "location_name", "title"]) ?? "";
  const address =
    getNestedString(location, ["address", "full_address", "street_address", "subtitle"]) ?? "";

  return name || address ? { address, name } : null;
}

export const annotationSources = [
  { source: "story_bloks_stickers", kinds: ["mention", "location"] },
  { source: "story_music_stickers", kinds: ["music"] },
  { source: "story_hashtags", kinds: ["hashtag"] },
  { source: "story_link_stickers", kinds: ["link"] },
  { source: "story_cta", kinds: ["link"] },
  { source: "story_bloks_tappables", kinds: ["link"] },
  { source: "text_post_share_to_ig_story_stickers", kinds: ["link"] },
  { source: "link", kinds: ["link"] },
  { source: "story_locations", kinds: ["location"] },
] as const;

type Sticker = StoryAnnotations["stickers"][number];

function extractSourceSticker(
  source: string,
  kind: string,
  value: JsonValue,
): Array<Sticker> | null {
  if (!isJsonObject(value)) {
    return null;
  }
  if (source === "story_bloks_stickers") {
    const data = getNestedRecord(getNestedRecord(value, "bloks_sticker"), "sticker_data");
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    const mention = getMentionStickerLabel(value);
    const location = getLocationFromValue(value);
    if (
      (Object.hasOwn(data, "ig_mention") && mention === null) ||
      (Object.hasOwn(data, "location") &&
        location === null &&
        getLocationObservation(value) === null)
    ) {
      return null;
    }
    return [
      ...(mention === null ? [] : [{ kind: "mention", label: mention }]),
      ...(location
        ? [
            {
              kind: "location",
              label: [location.name, location.address].filter(Boolean).join(", "),
            },
          ]
        : []),
    ];
  }
  let label: string | null;
  if (source === "story_locations") {
    const location = getLocationFromValue(value);
    label = location ? [location.name, location.address].filter(Boolean).join(", ") : null;
    if (label === null && getLocationObservation(value) !== null) {
      return [];
    }
  } else if (source === "story_music_stickers") {
    return getMusicStickers(value);
  } else if (source === "story_hashtags") {
    label = getHashtagStickerLabel(value);
  } else {
    label = getLinkStickerLabel(value);
  }
  return label === null ? null : [{ kind, label }];
}

interface AnnotationUpdate {
  source: string;
  stickers: Array<Sticker>;
  preservePrevious?: boolean;
}

export function getStoryAnnotationUpdates(
  story: StoryItem,
  reportMalformed?: (source: string) => void,
): Array<AnnotationUpdate> {
  const updates: Array<AnnotationUpdate> = [];
  for (const { source, kinds } of annotationSources) {
    const value = story[source];
    if (value === undefined || value === null) {
      continue;
    }
    const values = source === "link" && !Array.isArray(value) ? [value] : value;
    if (!Array.isArray(values)) {
      reportMalformed?.(source);
      continue;
    }
    const entries = values.map((entry) => {
      const stickers = extractSourceSticker(source, kinds[0], entry);
      // Only the outer sticker ID identifies the occurrence. Nested place,
      // mention, hashtag and audio IDs identify shared entities instead.
      const id = isJsonObject(entry) ? entry.id : undefined;
      const providerOccurrenceId = ProviderIdentifierSchema.safeParse(id);
      return (
        stickers?.map((sticker) => {
          if (providerOccurrenceId.success) {
            return { ...sticker, providerOccurrenceId: providerOccurrenceId.data };
          }
          return sticker;
        }) ?? null
      );
    });
    if (entries.some((entry) => entry === null)) {
      reportMalformed?.(source);
      continue;
    }
    updates.push({
      source,
      // An unlabelled observation does not make a source a complete replacement of
      // its previous display contribution. Keep known stickers alongside it.
      preservePrevious:
        source === "story_music_stickers"
          ? getMusicSourceUpdate(story)?.some(({ fields }) => fields.title === null)
          : getLocationSourceUpdates(story)
              .find((update) => update.source === source)
              ?.observations.some(({ fields }) => fields.name === null && fields.address === null),
      stickers: entries.flatMap((entry) => entry ?? []).map((sticker) => ({ ...sticker, source })),
    });
  }
  return updates;
}

export function getStoryAnnotations(story: StoryItem): StoryAnnotations {
  const { annotations } = story;
  if (annotations !== undefined) {
    const locations = annotations.stickers
      .filter((sticker) => sticker.kind === "location")
      .map((sticker) => sticker.label);
    return { ...annotations, locations: locations.length > 0 ? locations : annotations.locations };
  }
  const updates = getStoryAnnotationUpdates(story);
  const stickers = updates.flatMap((update) => update.stickers);
  return {
    locations: stickers
      .filter((sticker) => sticker.kind === "location")
      .map((sticker) => sticker.label),
    stickers,
  };
}

export function getStoryStickers(
  mediaPk: string,
  cachedItems: Map<string, StoryItem>,
): Array<string> {
  const story = cachedItems.get(mediaPk);

  return story
    ? getStoryAnnotations(story)
        .stickers.filter((sticker) => sticker.kind !== "location")
        .map((sticker) => sticker.label)
    : [];
}

export function getStoryLocations(
  mediaPk: string,
  cachedItems: Map<string, StoryItem>,
): Array<string> {
  const story = cachedItems.get(mediaPk);

  return story ? getStoryAnnotations(story).locations : [];
}
