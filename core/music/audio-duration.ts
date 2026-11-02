import { parseFile } from "music-metadata";

export async function audioFileDurationMs(filename: string): Promise<number | null> {
  try {
    const { format } = await parseFile(filename, { duration: true, skipCovers: true });
    const { duration } = format;
    return duration !== undefined && Number.isFinite(duration) && duration > 0
      ? Math.round(duration * 1000)
      : null;
  } catch {
    return null;
  }
}
