import { useState } from "react";
import type { MusicPreview } from "../music-preview.ts";
import { Badge } from "../shadcn/ui/badge.tsx";
import { MusicAudioPreview } from "./music-audio-preview.tsx";

interface MusicStickerProps {
  label: string;
  preview?: MusicPreview | null;
}

function MusicStickerContent({ label, preview }: MusicStickerProps) {
  const [failed, setFailed] = useState(false);
  if (preview === undefined || preview === null || preview.audioUrl === null || failed) {
    return (
      <Badge
        variant="secondary"
        title={label}
        className="tw:h-auto tw:max-w-full tw:py-1 tw:whitespace-normal"
      >
        <span className="tw:wrap-anywhere">{label}</span>
      </Badge>
    );
  }
  return (
    <MusicAudioPreview
      preview={preview}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}

export function MusicSticker(props: MusicStickerProps) {
  return <MusicStickerContent key={props.preview?.audioUrl ?? "badge"} {...props} />;
}
