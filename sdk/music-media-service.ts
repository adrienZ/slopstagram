import { randomUUID, createHash } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Buffer } from "node:buffer";
import type { DrizzleDatabase } from "./database/client.ts";
import type { MusicMediaState, MusicMetadataReference } from "./entities/music-metadata.ts";
import { audioFileDurationMs } from "./lib/audio-duration.ts";
import { BASE_CACHE_DIR, IMAGES_STORAGE_DIR } from "./lib/cache-service.ts";
import { audioFileExtension } from "./lib/music-media-types.ts";
import { findMusicMetadata, saveMusicMedia } from "./repositories/music-metadata-repository.ts";

const MAX_MEDIA_BYTES = 60 * 1024 * 1024;

interface CachedMusicMedia {
  cachePath: string | null;
  state: MusicMediaState;
  durationMs: number | null;
}

export interface MusicMediaOptions {
  database: DrizzleDatabase;
  directory?: string;
  fetchMedia?: (url: string) => Promise<Response>;
}

async function fileExists(directory: string, key: string | null) {
  if (key === null || !/^music\/[a-f0-9]{64}\.(?:mp3|m4a|aac|ogg|webm|wav|flac)$/u.test(key)) {
    return false;
  }
  try {
    const info = await stat(path.join(directory, key));
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

async function readBounded(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Empty media");
  }
  const chunks: Array<Uint8Array> = [];
  let size = 0;
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- Read the bounded response stream sequentially.
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      size += chunk.value.length;
      if (size > MAX_MEDIA_BYTES) {
        throw new Error("Media too large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
  }
  if (size === 0) {
    throw new Error("Empty media");
  }
  return Buffer.concat(chunks);
}

async function downloadMedia(
  source: string,
  id: string,
  directory: string,
  options: MusicMediaOptions,
  declaredAudioType?: "audio/mp4",
): Promise<CachedMusicMedia> {
  const url = new globalThis.URL(source);
  if (url.protocol !== "https:" || url.username || url.password) {
    return { cachePath: null, state: "unsupported", durationMs: null };
  }
  const response = await (
    options.fetchMedia ??
    (async (value) =>
      await globalThis.fetch(value, { signal: globalThis.AbortSignal.timeout(20_000) }))
  )(source);
  if (!response.ok) {
    await response.body?.cancel();
    return { cachePath: null, state: "failed", durationMs: null };
  }
  const contentType =
    response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  // Instagram labels its MPD-confirmed audio-only MP4 rendition as video/mp4.
  const extension = audioFileExtension(
    contentType === "video/mp4" && declaredAudioType === "audio/mp4"
      ? declaredAudioType
      : contentType,
  );
  if (extension === undefined) {
    await response.body?.cancel();
    return { cachePath: null, state: "unsupported", durationMs: null };
  }
  const received = await readBounded(response);
  const key = `music/${createHash("sha256").update(`${id}:audio`).digest("hex")}.${extension}`;
  const destination = path.join(directory, key);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await writeFile(temporary, received, { flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return { cachePath: key, state: "available", durationMs: await audioFileDurationMs(destination) };
}

export async function cacheReceivedAudio(
  id: string,
  source: string | null,
  cached: string | null,
  options: MusicMediaOptions,
  declaredAudioType?: "audio/mp4",
): Promise<CachedMusicMedia> {
  const directory = options.directory ?? path.resolve(BASE_CACHE_DIR, IMAGES_STORAGE_DIR);
  if (cached !== null && (await fileExists(directory, cached))) {
    return {
      cachePath: cached,
      state: "available",
      durationMs: await audioFileDurationMs(path.join(directory, cached)),
    };
  }
  if (source === null) {
    return { cachePath: null, state: "unavailable", durationMs: null };
  }
  try {
    return await downloadMedia(source, id, directory, options, declaredAudioType);
  } catch {
    return { cachePath: null, state: "failed", durationMs: null };
  }
}

// Cache received audio during report enrichment; artwork downloads are separate.
export async function processMusicMedia(
  reference: MusicMetadataReference,
  options: MusicMediaOptions,
) {
  const current = findMusicMetadata(options.database, reference);
  if (!current) {
    return null;
  }
  const result = await cacheReceivedAudio(
    current.id,
    current.audioSourceUrl,
    current.audioCachePath,
    options,
  );
  saveMusicMedia(
    options.database,
    reference,
    "audio",
    current.audioSourceUrl,
    result.cachePath,
    result.state,
    result.durationMs,
  );
  return findMusicMetadata(options.database, reference) ?? null;
}
