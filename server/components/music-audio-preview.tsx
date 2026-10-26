import { PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "../shadcn/ui/button.tsx";
import type { MusicPreview } from "../music-preview.ts";
import { useAudioPreview } from "../hooks/use-audio-preview.ts";

function audioTime(seconds: number) {
  const whole = Math.floor(Math.max(0, seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

interface MusicAudioPreviewProps {
  preview: MusicPreview;
  onError?: () => void;
}

function AudioPlayer({ preview, onError }: MusicAudioPreviewProps) {
  const player = useAudioPreview(onError);
  if (player.failed) {
    return null;
  }
  return (
    <div
      role="group"
      aria-label={`Lecteur audio : ${preview.description}`}
      title={preview.sourceKind === "story_audio" ? "Audio de la story" : undefined}
      className="tw:mt-1.5 tw:flex tw:w-56 tw:max-w-full tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-border tw:bg-muted/40 tw:p-2"
    >
      <audio
        ref={player.attachAudio}
        src={preview.audioUrl ?? undefined}
        aria-label={`Écouter : ${preview.description}`}
        preload="metadata"
        hidden
        {...player.mediaEvents}
      />
      <Button
        type="button"
        size="icon-sm"
        className="tw:rounded-full"
        aria-label={`${player.playing ? "Mettre en pause" : "Lire"} : ${preview.description}`}
        aria-pressed={player.playing}
        disabled={player.loading}
        onClick={() => {
          void player.toggle();
        }}
      >
        {player.playing ? <PauseIcon /> : <PlayIcon />}
      </Button>
      <div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1">
        <p className="tw:truncate tw:text-xs tw:font-medium" title={preview.description}>
          {preview.description}
        </p>
        <div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
          <input
            type="range"
            aria-label={`Avancer dans l’audio : ${preview.description}`}
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
