import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import sharp from "sharp";
import { z } from "zod";
import { parseBuffer } from "music-metadata";
import type {
  MusicMediaState,
  MusicMetadataReference,
} from "@@/core/domains/database/entities/music-metadata.ts";
import { audioDurationMs } from "./audio-duration.ts";
import {
  AUDIO_STORAGE_DIR,
  type AudioCacheStorage,
  type ImageCacheStorage,
} from "@@/core/domains/media-store/cache-storage.ts";
import { audioFileExtension } from "./music-media-types.ts";
import type { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";

const MAX_MEDIA_BYTES = 60 * 1024 * 1024;

interface CachedMusicMedia {
  cachePath: string | null;
  state: MusicMediaState;
  durationMs: number | null;
}

type MusicStorageRuntime = Pick<Runtime, "fetchMedia" | "storage">;

type MusicMediaRuntime = MusicStorageRuntime & {
  stories: Pick<StoryRepository, "findMusicMetadata" | "saveMusicMedia">;
};

async function fileExists(storage: AudioCacheStorage, key: string | null) {
  if (key === null || !/^audio\/[a-f0-9]{64}\.(?:mp3|m4a|aac|ogg|webm|wav|flac)$/u.test(key)) {
    return false;
  }
  try {
    const info = await storage.getMeta(key.slice("audio/".length));
    return z.number().positive().safeParse(info.size).success;
  } catch {
    return false;
  }
}

async function readBounded(response: Response, limit = MAX_MEDIA_BYTES) {
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
      if (size > limit) {
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
  runtime: MusicStorageRuntime,
  declaredAudioType?: "audio/mp4",
): Promise<CachedMusicMedia> {
  const url = new globalThis.URL(source);
  if (url.protocol !== "https:" || url.username || url.password) {
    return { cachePath: null, state: "unsupported", durationMs: null };
  }
  const response = await (
    runtime.fetchMedia ??
    (async (value) =>
      await globalThis.fetch(value, { signal: globalThis.AbortSignal.timeout(20_000) }))
  )(source);
  if (!response.ok) {
    await response.body?.cancel();
    return { cachePath: null, state: "failed", durationMs: null };
  }
  const contentType =
    response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const verifyMp4 = contentType === "video/mp4" && declaredAudioType === undefined;
  // Instagram labels its MPD-confirmed audio-only MP4 rendition as video/mp4.
  const extension = audioFileExtension(
    contentType === "video/mp4" && (declaredAudioType === "audio/mp4" || verifyMp4)
      ? "audio/mp4"
      : contentType,
  );
  if (extension === undefined) {
    await response.body?.cancel();
    return { cachePath: null, state: "unsupported", durationMs: null };
  }
  const received = await readBounded(response);
  if (verifyMp4) {
    const { format } = await parseBuffer(received, { mimeType: "video/mp4" });
    if (format.hasAudio !== true || format.hasVideo !== false) {
      return { cachePath: null, state: "unsupported", durationMs: null };
    }
  }
  const filename = `${createHash("sha256").update(`${id}:audio`).digest("hex")}.${extension}`;
  const key = `${AUDIO_STORAGE_DIR}/${filename}`;
  await runtime.storage.audio.setItemRaw(filename, received);
  return { cachePath: key, state: "available", durationMs: await audioDurationMs(received) };
}

export async function cacheReceivedAudio(
  runtime: MusicStorageRuntime,
  id: string,
  source: string | null,
  cached: string | null,
  declaredAudioType?: "audio/mp4",
): Promise<CachedMusicMedia> {
  const storage = runtime.storage.audio;
  if (cached !== null && (await fileExists(storage, cached))) {
    const stored: unknown = await storage.getItemRaw(cached.slice(`${AUDIO_STORAGE_DIR}/`.length));
    return {
      cachePath: cached,
      state: "available",
      durationMs: stored instanceof Uint8Array ? await audioDurationMs(stored) : null,
    };
  }
  if (source === null) {
    return { cachePath: null, state: "unavailable", durationMs: null };
  }
  try {
    return await downloadMedia(source, id, runtime, declaredAudioType);
  } catch {
    return { cachePath: null, state: "failed", durationMs: null };
  }
}

// Cache received audio during report enrichment; artwork downloads are separate.
export async function processMusicMedia(
  runtime: MusicMediaRuntime,
  reference: MusicMetadataReference,
) {
  const repository = runtime.stories;
  const current = repository.findMusicMetadata(reference);
  if (!current) {
    return null;
  }
  const result = await cacheReceivedAudio(
    runtime,
    current.id,
    current.audioSourceUrl,
    current.audioCachePath,
  );
  repository.saveMusicMedia(
    reference,
    "audio",
    current.audioSourceUrl,
    result.cachePath,
    result.state,
    result.durationMs,
  );
  return repository.findMusicMetadata(reference) ?? null;
}

async function cachedArtworkExists(storage: ImageCacheStorage, key: string | null) {
  if (key === null || !/^music\/[a-f0-9]{64}\.jpg$/u.test(key)) {
    return false;
  }
  try {
    const info = await storage.getMeta(key);
    return z.number().positive().safeParse(info.size).success;
  } catch {
    return false;
  }
}

async function downloadArtwork(source: string, id: string, runtime: MusicStorageRuntime) {
  try {
    const url = new globalThis.URL(source);
    if (url.protocol !== "https:" || url.username || url.password) {
      return { cachePath: null, state: "unsupported" as const };
    }
    const response = await (
      runtime.fetchMedia ??
      (async (value) =>
        await globalThis.fetch(value, { signal: globalThis.AbortSignal.timeout(20_000) }))
    )(url.href);
    if (!response.ok || response.headers.get("content-type")?.startsWith("image/") !== true) {
      await response.body?.cancel();
      return {
        cachePath: null,
        state: response.ok ? ("unsupported" as const) : ("failed" as const),
      };
    }
    const bytes = await readBounded(response, 8 * 1024 * 1024);
    const jpeg = await sharp(bytes, { limitInputPixels: 16_000_000 })
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg()
      .toBuffer();
    const key = `music/${createHash("sha256").update(`${id}:artwork`).digest("hex")}.jpg`;
    await runtime.storage.images.setItemRaw(key, jpeg);
    return { cachePath: key, state: "available" as const };
  } catch {
    return { cachePath: null, state: "failed" as const };
  }
}

export async function processMusicArtwork(
  runtime: MusicMediaRuntime,
  reference: MusicMetadataReference,
) {
  const repository = runtime.stories;
  const current = repository.findMusicMetadata(reference);
  if (!current || current.artworkSourceUrl === null) {
    return current ?? null;
  }
  const storage = runtime.storage.images;
  if (await cachedArtworkExists(storage, current.artworkCachePath)) {
    return current;
  }
  const result = await downloadArtwork(current.artworkSourceUrl, current.id, runtime);
  repository.saveMusicMedia(
    reference,
    "artwork",
    current.artworkSourceUrl,
    result.cachePath,
    result.state,
  );
  return repository.findMusicMetadata(reference) ?? null;
}
