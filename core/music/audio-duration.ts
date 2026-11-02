import { parseBuffer } from "music-metadata";

export async function audioDurationMs(audio: Uint8Array): Promise<number | null> {
  try {
    const { format } = await parseBuffer(audio, {}, { duration: true, skipCovers: true });
    const { duration } = format;
    return duration !== undefined && Number.isFinite(duration) && duration > 0
      ? Math.round(duration * 1000)
      : null;
  } catch {
    return null;
  }
}
