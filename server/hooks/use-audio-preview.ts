import { useRef, useState, type SyntheticEvent } from "react";
import { useAudio, useUnmount } from "react-use";
import type { MusicPreview } from "../music-preview.ts";

export function useAudioPreview(preview: MusicPreview, preload: boolean, onError?: () => void) {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const lastPlaying = useRef<HTMLAudioElement>(null);
  const [audio, state, controls, audioRef] = useAudio({
    src: preview.audioUrl ?? "",
    "aria-label": `Écouter : ${preview.description}`,
    preload: preload && preview.durationMs === null ? "metadata" : "none",
    hidden: true,
    onPlay(event: SyntheticEvent<HTMLAudioElement>) {
      lastPlaying.current = event.currentTarget;
      for (const other of event.currentTarget.ownerDocument.querySelectorAll("audio")) {
        if (other !== event.currentTarget && !other.paused) {
          other.pause();
        }
      }
    },
    onEnded(event: SyntheticEvent<HTMLAudioElement>) {
      event.currentTarget.pause();
    },
    onError() {
      setFailed(true);
      onError?.();
    },
  });
  useUnmount(() => {
    if (lastPlaying.current !== null && !lastPlaying.current.paused) {
      lastPlaying.current.pause();
    }
  });

  const duration =
    Number.isFinite(state.duration) && state.duration > 0
      ? state.duration
      : (preview.durationMs ?? 0) / 1000;
  const currentTime = Number.isFinite(state.time) ? state.time : 0;

  async function toggle() {
    if (!state.paused) {
      controls.pause();
      return;
    }
    setLoading(true);
    try {
      await controls.play();
    } catch {
      setFailed(true);
      onError?.();
    } finally {
      setLoading(false);
    }
  }

  function seek(value: number) {
    if (duration <= 0 || audioRef.current === null) {
      return;
    }
    const time = Math.max(0, Math.min(duration, value));
    if (Number.isFinite(state.duration) && state.duration > 0) {
      controls.seek(time);
    } else {
      // The library cannot seek before browser metadata arrives; the stored duration
      // still makes seeking possible without preloading the file.
      audioRef.current.currentTime = time;
    }
  }

  return { audio, playing: !state.paused, loading, failed, currentTime, duration, toggle, seek };
}
