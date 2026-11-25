import { useTranslation } from "react-i18next";
import { PauseIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { Button } from "../shadcn/ui/button.tsx";
import type { MusicPreview } from "../utils/music-preview.ts";
import { useAudioPreview } from "../hooks/use-audio-preview.ts";

function audioTime(seconds: number) {
  const whole = Math.floor(Math.max(0, seconds));

  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

interface MusicAudioPreviewProps {
  preview: MusicPreview;
  preload?: boolean;
  onError?: () => void;
}

function AudioPlayer({ preview, preload = true, onError }: MusicAudioPreviewProps) {
  const { t } = useTranslation();
  const player = useAudioPreview(preview, preload, onError);
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);

  if (preview.audioUrl === null || player.failed) {
    return null;
  }

  const hasArtwork = preview.artworkUrl !== null && preview.artworkUrl !== failedArtworkUrl;

  return (
    <fieldset
      aria-label={t("music.player", { description: preview.description })}
      title={preview.sourceKind === "story_audio" ? t("music.storyAudio") : undefined}
      className="tw:flex tw:w-56 tw:min-w-0 tw:max-w-full tw:items-center tw:gap-2 tw:overflow-hidden tw:rounded-lg tw:border tw:border-border tw:bg-muted/40 tw:p-2"
    >
      {player.audio}
      <span className="tw:relative tw:size-10 tw:shrink-0">
        {hasArtwork && (
          <img
            src={preview.artworkUrl ?? undefined}
            alt={t("music.artwork", { description: preview.description })}
            width={40}
            height={40}
            loading="lazy"
            className={cn(
              "tw:absolute tw:inset-0 tw:size-10 tw:animate-spin tw:rounded-full tw:object-cover tw:[animation-duration:8s] tw:motion-reduce:animate-none",
              player.playing ? "tw:running" : "tw:paused",
            )}
            onError={() => {
              setFailedArtworkUrl(preview.artworkUrl);
            }}
          />
        )}
        <Button
          type="button"
          variant={hasArtwork ? "ghost" : "secondary"}
          size="icon"
          className="tw:relative tw:size-10"
          aria-label={t(player.playing ? "music.pause" : "music.play", {
            description: preview.description,
          })}
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
      </span>
      <div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1">
        <p className="tw:min-w-0 tw:truncate tw:text-xs tw:font-medium" title={preview.description}>
          {preview.description}
        </p>
        <div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
          <input
            type="range"
            aria-label={t("music.seek", { description: preview.description })}
            min={0}
            max={player.duration}
            step={0.1}
            value={Math.min(player.currentTime, player.duration)}
            disabled={player.duration === 0}
            className="tw:h-1 tw:min-w-0 tw:flex-1 tw:cursor-pointer tw:accent-primary tw:disabled:cursor-default"
            onChange={(event) => {
              player.seek(event.currentTarget.valueAsNumber);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
          />
          <div className="tw:flex tw:shrink-0 tw:gap-0.5 tw:text-xs tw:text-muted-foreground tw:tabular-nums">
            <span>{audioTime(player.currentTime)}</span>
            <span aria-hidden="true">/</span>
            <span>{player.duration > 0 ? audioTime(player.duration) : "—:——"}</span>
          </div>
        </div>
      </div>
    </fieldset>
  );
}

export function MusicAudioPreview(props: MusicAudioPreviewProps) {
  if (props.preview.audioUrl === null) {
    return null;
  }

  return <AudioPlayer key={`${props.preview.id}:${props.preview.audioUrl}`} {...props} />;
}
