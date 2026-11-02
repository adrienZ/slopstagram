import type { StorySticker } from "./entities/story.ts";
import type { StoryLocationObservation } from "./entities/location-metadata.ts";
import type { StoryMusicObservation } from "./entities/music-metadata.ts";
import type { StoryAudio } from "./entities/story-audio.ts";

export const STORY_MEDIA_TYPES = {
  IMAGE: "image",
  VIDEO: "video",
} as const;

export type StoryMediaType = (typeof STORY_MEDIA_TYPES)[keyof typeof STORY_MEDIA_TYPES];

export interface StoryAnnotations {
  storyAudio?: StoryAudio;
  locationObservations?: Array<StoryLocationObservation>;
  musicObservations?: Array<StoryMusicObservation>;
  locations: Array<string>;
  stickers: Array<StorySticker>;
}
