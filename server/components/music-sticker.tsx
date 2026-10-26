import { useState } from "react";
import { Music2Icon } from "lucide-react";
import { Badge } from "../shadcn/ui/badge.tsx";
import type { MusicPreview } from "../music-preview.ts";
import { MusicAudioPreview } from "./music-audio-preview.tsx";

interface MusicStickerProps {
  label: string;
  preview?: MusicPreview | null;
  preload?: boolean;
}

function MusicStickerContent({ label, preview, preload = true }: MusicStickerProps) {
  const [failed, setFailed] = useState(false);
  if (preview === undefined || preview === null || preview.audioUrl === null || failed) {
    return (
      <Badge
        variant="secondary"
        title={label}
        className="tw:h-auto tw:max-w-full tw:gap-1 tw:py-1 tw:whitespace-normal"
      >
        <Music2Icon aria-hidden="true" />
        <span className="tw:wrap-anywhere">{label}</span>
      </Badge>
    );
  }
  return (
    <MusicAudioPreview
      preview={preview}
      preload={preload}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}

export function MusicSticker(props: MusicStickerProps) {
  return <MusicStickerContent key={props.preview?.audioUrl ?? "badge"} {...props} />;
}
