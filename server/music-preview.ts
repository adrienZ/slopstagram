import type { StoryMusicObservation } from "../sdk/entities/music-metadata.ts";
import type { StoryAnnotations } from "../sdk/lib/types.ts";

export interface MusicPreview {
  id: string;
  description: string;
  audioUrl: string | null;
  artworkUrl: string | null;
  sourceKind: "music_asset" | "story_audio";
}

export interface MusicStickerItem {
  key: string;
  label: string;
  preview: MusicPreview | null;
}

function localMediaPath(key: string | null, state: string): string | null {
  return state === "available" &&
    key !== null &&
    /^music\/[a-f0-9]{64}\.(?:mp3|m4a|aac|ogg|webm|wav|flac)$/u.test(key)
    ? `/media/${key}`
    : null;
}

function localArtworkPath(key: string | null, state: string): string | null {
  return state === "available" &&
    key !== null &&
    /^music\/[a-f0-9]{64}\.(?:jpg|png|webp)$/u.test(key)
    ? `/media/${key}`
    : null;
}

export function musicPreview(observation: StoryMusicObservation): MusicPreview | null {
  const { metadata } = observation;
  const audioUrl = localMediaPath(metadata.audioCachePath, metadata.audioState);
  if (audioUrl === null) {
    return null;
  }
  return {
    id: observation.id,
    description: [metadata.title, metadata.artist].filter(Boolean).join(" — ") || "Musique reçue",
    audioUrl,
    artworkUrl: localArtworkPath(metadata.artworkCachePath, metadata.artworkState),
    sourceKind: "music_asset",
  };
}

function storySongDescription(annotations: StoryAnnotations | undefined): string {
  const metadataNames = (annotations?.musicObservations ?? []).flatMap(({ metadata }) => {
    const title = metadata.title?.trim();
    if (title === undefined || title.length === 0) {
      return [];
    }
    return [[title, metadata.artist?.trim()].filter(Boolean).join(" — ")];
  });
  const names =
    metadataNames.length > 0
      ? metadataNames
      : (annotations?.stickers ?? [])
          .filter(({ kind }) => kind === "music")
          .map(({ label }) => label.trim())
          .filter((label) => label.length > 0);
  return [...new Set(names)].join(" / ") || "Audio de la story";
}

export function storyAudioPreview(annotations: StoryAnnotations | undefined): MusicPreview | null {
  const audio = annotations?.storyAudio;
  const audioUrl = audio ? localMediaPath(audio.cachePath, audio.state) : null;
  return audioUrl === null || !audio
    ? null
    : {
        id: `story:${audio.mediaPk}`,
        description: storySongDescription(annotations),
        sourceKind: "story_audio",
        audioUrl,
        artworkUrl: null,
      };
}

export function storyMusicPreviews(annotations: StoryAnnotations | undefined): Array<MusicPreview> {
  const assets = (annotations?.musicObservations ?? [])
    .map(musicPreview)
    .filter((preview) => preview !== null);
  const unique = [...new Map(assets.map((preview) => [preview.audioUrl, preview])).values()];
  if (unique.length > 0) {
    return unique;
  }
  const soundtrack = storyAudioPreview(annotations);
  return soundtrack === null ? [] : [soundtrack];
}

export function musicStickerItems(
  annotations: StoryAnnotations | undefined,
): Array<MusicStickerItem> {
  const previews = storyMusicPreviews(annotations);
  const soundtrack = previews.find(({ sourceKind }) => sourceKind === "story_audio");
  const linked = new Set<string>();
  const items = (annotations?.stickers ?? [])
    .filter(({ kind }) => kind === "music")
    .map((sticker, index) => {
      const observation =
        sticker.occurrenceId === undefined
          ? undefined
          : annotations?.musicObservations?.find(
              ({ occurrenceId }) => occurrenceId === sticker.occurrenceId,
            );
      const asset = observation === undefined ? null : musicPreview(observation);
      if (asset !== null) {
        linked.add(asset.id);
      }
      return {
        key: sticker.occurrenceId ?? `music:${index}`,
        label: sticker.label,
        preview: asset ?? (index === 0 ? (soundtrack ?? null) : null),
      };
    });
  // A soundtrack is displayed once at story level; this creates no occurrence link.
  const unlinked = previews.filter(
    (preview) =>
      !linked.has(preview.id) && (preview.sourceKind !== "story_audio" || items.length === 0),
  );
  return [
    ...items,
    ...unlinked.map((preview) => ({ key: preview.id, label: preview.description, preview })),
  ];
}
