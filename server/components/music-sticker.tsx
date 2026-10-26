import type { MusicPreview } from "../music-preview.ts";
import { MusicAudioPreview } from "./music-audio-preview.tsx";

interface MusicStickerProps {
  label: string;
  preview?: MusicPreview | null;
  preload?: boolean;
}

export function MusicSticker({ label, preview, preload = true }: MusicStickerProps) {
  return (
    <MusicAudioPreview
      preload={preload}
      preview={
        preview ?? {
          id: label,
          description: label,
          audioUrl: null,
          artworkUrl: null,
          durationMs: null,
          sourceKind: "music_asset",
        }
      }
    />
  );
}
