import { useState } from "react";
import type { MusicPreview } from "../music-preview.ts";

export function MusicMedia({
  preview,
  showDetails = false,
}: {
  preview: MusicPreview;
  showDetails?: boolean;
}) {
  const [audioFailed, setAudioFailed] = useState(false);
  const [artworkFailed, setArtworkFailed] = useState(false);
  const audioUrl = audioFailed ? null : preview.audioUrl;
  const artworkUrl = artworkFailed ? null : preview.artworkUrl;
  if (audioUrl === null && artworkUrl === null) {
    return null;
  }
  return (
    <div className="tw:mt-2 tw:flex tw:w-60 tw:max-w-full tw:flex-col tw:gap-2">
      {showDetails && <p className="tw:text-sm tw:wrap-anywhere">{preview.description}</p>}
      {artworkUrl !== null && (
        <img
          src={artworkUrl}
          alt={`Pochette : ${preview.description}`}
          width={64}
          height={64}
          loading="lazy"
          className="tw:size-16 tw:rounded-md tw:object-cover"
          onError={() => {
            setArtworkFailed(true);
          }}
        />
      )}
      {audioUrl !== null && (
        <audio
          aria-label={`Écouter : ${preview.description}`}
          src={audioUrl}
          controls
          preload="none"
          className="tw:h-10 tw:w-full tw:min-w-0"
          onError={() => {
            setAudioFailed(true);
          }}
        />
      )}
    </div>
  );
}
