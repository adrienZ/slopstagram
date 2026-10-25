import { z } from "zod";
import type { MusicFields } from "./entities/music-metadata.ts";
import { isJsonObject, type JsonValue } from "./lib/json-value.ts";
import type { StoryItem } from "./lib/types.ts";

const IdentifierSchema = z.union([
  z.string().refine((value) => value.trim().length > 0),
  z.number().int().transform(String),
]);
const TextSchema = z.string().refine((value) => value.trim().length > 0);
const DurationSchema = z.number().int().positive();

function identifier(value: JsonValue | undefined): string | null {
  const parsed = IdentifierSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export interface MusicObservationInput {
  providerOccurrenceId: string | null;
  fields: MusicFields;
}

export function getMusicObservation(value: JsonValue): MusicObservationInput | null {
  if (!isJsonObject(value)) {
    return null;
  }
  const info = value.music_asset_info ?? {};
  const providerOccurrenceId = identifier(value.id);
  if (!isJsonObject(info)) {
    return null;
  }
  const title = TextSchema.safeParse(info.title);
  const artist = TextSchema.safeParse(info.display_artist);
  const duration = DurationSchema.safeParse(info.duration_in_ms);
  const fields: MusicFields = {
    instagramAudioAssetId: identifier(info.audio_asset_id),
    title: title.success ? title.data : null,
    artist: artist.success ? artist.data : null,
    durationMs: duration.success ? duration.data : null,
  };
  // An outer ID is useful provenance even when every audio field is missing.
  return providerOccurrenceId !== null || Object.values(fields).some((field) => field !== null)
    ? { providerOccurrenceId, fields }
    : null;
}

export function getMusicSourceUpdate(story: StoryItem): Array<MusicObservationInput> | null {
  if (!Array.isArray(story.story_music_stickers)) {
    return null;
  }
  const observations = story.story_music_stickers.map(getMusicObservation);
  return observations.some((entry) => entry === null)
    ? null
    : observations.filter((entry) => entry !== null);
}
