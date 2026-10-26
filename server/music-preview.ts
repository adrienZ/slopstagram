import type { StoryMusicObservation } from "../sdk/entities/music-metadata.ts";

export interface MusicPreview {
  id: string;
  description: string;
  audioUrl: string | null;
  artworkUrl: string | null;
}

function localMediaPath(key: string | null, state: string): string | null {
  return state === "available" &&
    key !== null &&
    /^music\/[a-f0-9]{64}\.(?:jpg|mp3|m4a|aac|ogg|webm|wav|flac)$/u.test(key)
    ? `/media/${key}`
    : null;
}

export function musicPreview(observation: StoryMusicObservation): MusicPreview {
  const { metadata } = observation;
  return {
    id: observation.id,
    description: [metadata.title, metadata.artist].filter(Boolean).join(" — ") || "Musique reçue",
    audioUrl: localMediaPath(metadata.audioCachePath, metadata.audioState),
    artworkUrl: localMediaPath(metadata.artworkCachePath, metadata.artworkState),
  };
}
