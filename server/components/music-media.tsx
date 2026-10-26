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
  return (
    <div className="tw:mt-2 tw:flex tw:w-60 tw:max-w-full tw:flex-col tw:gap-2">
      {showDetails && <p className="tw:text-sm tw:wrap-anywhere">{preview.description}</p>}
      {preview.artworkUrl !== null && !artworkFailed ? (
        <img
          src={preview.artworkUrl}
          alt={`Pochette : ${preview.description}`}
          width={64}
          height={64}
          loading="lazy"
          className="tw:size-16 tw:rounded-md tw:object-cover"
          onError={() => {
            setArtworkFailed(true);
          }}
        />
      ) : (
        <p className="tw:text-xs tw:text-muted-foreground">Pochette indisponible</p>
      )}
      {preview.audioUrl !== null && !audioFailed ? (
        <audio
          aria-label={`Écouter : ${preview.description}`}
          src={preview.audioUrl}
          controls
          preload="none"
          className="tw:h-10 tw:w-full tw:min-w-0"
          onError={() => {
            setAudioFailed(true);
          }}
        >
          Votre navigateur ne prend pas en charge cet audio.
        </audio>
      ) : (
        <p className="tw:text-xs tw:text-muted-foreground">Audio indisponible</p>
      )}
    </div>
  );
}
