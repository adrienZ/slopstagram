import { URL } from "node:url";
import { z } from "zod";
import { isJsonObject, type JsonObject, type JsonValue } from "./lib/json-value.ts";
import type { StoryItem } from "./lib/types.ts";

function getNestedRecord(value: JsonValue, key: string): JsonObject | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const nested = value[key];

  return isJsonObject(nested) ? nested : null;
}

function getNestedString(value: JsonValue, keys: readonly string[]): string | null {
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
    return `mention:@${username}`;
  }

  const fullName = getNestedString(mention, ["full_name"]);
  return fullName !== null && fullName.length > 0 ? `mention:${fullName}` : null;
}

function getMusicStickerLabel(value: JsonValue): string | null {
  const info = getNestedRecord(value, "music_asset_info");

  if (info === null) {
    return null;
  }

  const title = getNestedString(info, ["title"]);
  const artist = getNestedString(info, ["display_artist"]);

  if (title !== null && title.length > 0 && artist !== null && artist.length > 0) {
    return `music:${title} - ${artist}`;
  }

  return title !== null && title.length > 0 ? `music:${title}` : null;
}

function getHashtagStickerLabel(value: JsonValue): string | null {
  const hashtag =
    getNestedString(value, ["hashtag", "name", "tag_name"]) ??
    getNestedString(getNestedRecord(value, "hashtag"), ["name", "tag_name"]);

  if (hashtag === null || hashtag.length === 0) {
    return null;
  }

  return hashtag.startsWith("#") ? `hashtag:${hashtag}` : `hashtag:#${hashtag}`;
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

function getLinkStickerLabel(value: JsonValue): string | null {
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
    return `link:${directTitle} (${directUrl})`;
  }

  if (directUrl !== null && directUrl.length > 0) {
    return `link:${directUrl}`;
  }

  return getNestedLinkStickerLabel(value) ?? getDirectTitleLabel(directTitle);
}

function getNestedLinkStickerLabel(value: JsonValue): string | null {
  for (const key of [
    "story_link",
    "link_sticker",
    "link",
    "cta",
    "bloks_tappable_sticker",
  ] as const) {
    const nested = getNestedRecord(value, key);
    const nestedLabel = nested === null ? null : getLinkStickerLabel(nested);

    if (nestedLabel !== null && nestedLabel.length > 0) {
      return nestedLabel;
    }
  }

  return null;
}

function getDirectTitleLabel(directTitle: string | null): string | null {
  return directTitle !== null && directTitle.length > 0 ? `link:${directTitle}` : null;
}

function getLocationRecord(value: JsonValue): JsonObject | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const name = getNestedString(value, ["name", "location_name", "title"]);
  const address = getNestedString(value, ["address", "full_address", "street_address", "subtitle"]);

  if ((name !== null && name.length > 0) || (address !== null && address.length > 0)) {
    return value;
  }

  return getNestedLocationRecord(value);
}

function getNestedLocationRecord(record: JsonObject): JsonObject | null {
  for (const key of [
    "location",
    "venue",
    "place",
    "story_location",
    "location_sticker",
    "bloks_sticker",
    "sticker_data",
  ] as const) {
    const nestedLocation = getLocationRecord(getNestedRecord(record, key));

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

function getStoryLocationsFromItem(story: StoryItem): string[] {
  const locations: string[] = [];
  const seen = new Set<string>();

  for (const value of [...(story.story_locations ?? []), ...(story.story_bloks_stickers ?? [])]) {
    const location = getLocationFromValue(value);
    const formattedLocation = location
      ? [location.name, location.address].filter(Boolean).join(", ")
      : "";
    const key = formattedLocation.toLowerCase();

    if (formattedLocation && !seen.has(key)) {
      seen.add(key);
      locations.push(formattedLocation);
    }
  }

  return locations;
}

function addUniqueLabel(labels: string[], seen: Set<string>, label: string | null): void {
  if (label === null || label.length === 0 || seen.has(label)) {
    return;
  }

  seen.add(label);
  labels.push(label);
}

function getStickerLabels(story: StoryItem): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const sticker of story.story_bloks_stickers ?? []) {
    addUniqueLabel(labels, seen, getMentionStickerLabel(sticker));
  }

  for (const sticker of story.story_music_stickers ?? []) {
    addUniqueLabel(labels, seen, getMusicStickerLabel(sticker));
  }

  for (const sticker of story.story_hashtags ?? []) {
    addUniqueLabel(labels, seen, getHashtagStickerLabel(sticker));
  }

  for (const sticker of [
    ...(story.story_link_stickers ?? []),
    ...(story.story_cta ?? []),
    ...(story.story_bloks_tappables ?? []),
    ...(story.text_post_share_to_ig_story_stickers ?? []),
    story.link ?? null,
  ]) {
    addUniqueLabel(labels, seen, getLinkStickerLabel(sticker));
  }

  return labels;
}

export function getStoryStickers(mediaPk: string, cachedItems: Map<string, StoryItem>): string[] {
  const story = cachedItems.get(mediaPk);

  return story ? getStickerLabels(story) : [];
}

export function getStoryLocations(mediaPk: string, cachedItems: Map<string, StoryItem>): string[] {
  const story = cachedItems.get(mediaPk);

  return story ? getStoryLocationsFromItem(story) : [];
}
