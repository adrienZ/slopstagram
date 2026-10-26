import { Music2Icon, PauseIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { Button } from "../shadcn/ui/button.tsx";
import type { MusicPreview } from "../music-preview.ts";
import { useAudioPreview } from "../hooks/use-audio-preview.ts";
import { ScrollingTitle } from "./scrolling-title.tsx";

function audioTime(seconds: number) {
  const whole = Math.floor(Math.max(0, seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

interface MusicAudioPreviewProps {
  preview: MusicPreview;
  preload?: boolean;
}

function AudioPlayer({ preview, preload = true }: MusicAudioPreviewProps) {
  const player = useAudioPreview(preview.durationMs);
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);
  const playable = preview.audioUrl !== null && !player.failed;
  const hasArtwork = preview.artworkUrl !== null && preview.artworkUrl !== failedArtworkUrl;
  return (
    <div
      role="group"
      aria-label={`Lecteur audio : ${preview.description}`}
      title={preview.sourceKind === "story_audio" ? "Audio de la story" : undefined}
      className="tw:flex tw:w-56 tw:min-w-0 tw:max-w-full tw:items-center tw:gap-2 tw:overflow-hidden tw:rounded-lg tw:border tw:border-border tw:bg-muted/40 tw:p-2"
    >
      {playable && (
        <audio
          ref={player.attachAudio}
          src={preview.audioUrl ?? undefined}
          aria-label={`Écouter : ${preview.description}`}
          preload={preload ? "metadata" : "none"}
          hidden
          {...player.mediaEvents}
        />
      )}
      <span className="tw:relative tw:size-10 tw:shrink-0">
        {hasArtwork && (
          <img
            src={preview.artworkUrl ?? undefined}
            alt={`Pochette de ${preview.description}`}
            width={40}
            height={40}
            loading="lazy"
            className="tw:absolute tw:inset-0 tw:size-10 tw:animate-spin tw:rounded-full tw:object-cover tw:[animation-duration:8s] tw:motion-reduce:animate-none"
            style={{ animationPlayState: player.playing ? "running" : "paused" }}
            onError={() => {
              setFailedArtworkUrl(preview.artworkUrl);
            }}
          />
        )}
        {playable ? (
          <Button
            type="button"
            variant={hasArtwork ? "ghost" : "secondary"}
            size="icon"
            className="tw:relative tw:size-10 tw:rounded-full"
            aria-label={`${player.playing ? "Mettre en pause" : "Lire"} : ${preview.description}`}
            aria-pressed={player.playing}
            disabled={player.loading}
            onClick={() => {
              void player.toggle();
            }}
          >
            <span className={cn("tw:rounded-full tw:p-1", hasArtwork && "tw:bg-background/85")}>
              {player.playing ? <PauseIcon /> : <PlayIcon />}
            </span>
          </Button>
        ) : (
          <span
            role="img"
            aria-label={`Audio indisponible : ${preview.description}`}
            className="tw:relative tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-full tw:bg-muted tw:text-muted-foreground"
          >
            <Music2Icon className="tw:size-4" aria-hidden="true" />
          </span>
        )}
      </span>
      <div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1">
        <ScrollingTitle>{preview.description}</ScrollingTitle>
        <div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
          <input
            type="range"
            aria-label={`Avancer dans l’audio : ${preview.description}`}
            min={0}
            max={player.duration}
            step={0.1}
            value={Math.min(player.currentTime, player.duration)}
            disabled={!playable || player.duration === 0}
            className="tw:h-1 tw:min-w-0 tw:flex-1 tw:cursor-pointer tw:accent-primary tw:disabled:cursor-default"
            onChange={(event) => {
              player.seek(event.currentTarget.valueAsNumber);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
          />
          <div className="tw:flex tw:shrink-0 tw:gap-0.5 tw:text-[10px] tw:text-muted-foreground tw:tabular-nums">
            <span>{audioTime(player.currentTime)}</span>
            <span aria-hidden="true">/</span>
            <span>{player.duration > 0 ? audioTime(player.duration) : "—:——"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MusicAudioPreview(props: MusicAudioPreviewProps) {
  return <AudioPlayer key={`${props.preview.id}:${props.preview.audioUrl}`} {...props} />;
}
