import { useRef, useState, type SyntheticEvent } from "react";

export function useAudioPreview(durationMs: number | null, onError?: () => void) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const initialDuration = durationMs === null ? 0 : durationMs / 1000;
  const [mediaDuration, setDuration] = useState(0);
  const duration = mediaDuration > 0 ? mediaDuration : initialDuration;

  const [attachAudio] = useState(
    () =>
      function bindAudio(audio: HTMLAudioElement | null) {
        audioRef.current = audio;
        return () => {
          if (audio !== null && !audio.paused) {
            audio.pause();
          }
          audioRef.current = null;
        };
      },
  );

  async function toggle() {
    const audio = audioRef.current;
    if (audio === null) {
      return;
    }
    if (playing) {
      audio.pause();
      return;
    }
    setLoading(true);
    try {
      await audio.play();
    } catch {
      setPlaying(false);
      setFailed(true);
      onError?.();
    } finally {
      setLoading(false);
    }
  }

  function updateProgress(event: SyntheticEvent<HTMLAudioElement>) {
    const audio = event.currentTarget;
    setDuration(
      Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : initialDuration,
    );
    setCurrentTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
  }

  function onPlay(event: SyntheticEvent<HTMLAudioElement>) {
    for (const audio of event.currentTarget.ownerDocument.querySelectorAll("audio")) {
      if (audio !== event.currentTarget && !audio.paused) {
        audio.pause();
      }
    }
    setPlaying(true);
  }

  function seek(value: number) {
    if (audioRef.current !== null && duration > 0) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, value));
      setCurrentTime(audioRef.current.currentTime);
    }
  }

  return {
    attachAudio,
    playing,
    loading,
    failed,
    currentTime,
    duration,
    toggle,
    seek,
    mediaEvents: {
      onPlay,
      onPause: () => {
        setPlaying(false);
      },
      onEnded: () => {
        setPlaying(false);
      },
      onError: () => {
        setPlaying(false);
        setFailed(true);
        onError?.();
      },
      onLoadedMetadata: updateProgress,
      onDurationChange: updateProgress,
      onTimeUpdate: updateProgress,
    },
  };
}
