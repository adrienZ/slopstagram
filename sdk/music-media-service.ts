import { randomUUID, createHash } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Buffer } from "node:buffer";
import type { DrizzleDatabase } from "./database/client.ts";
import type { MusicMediaState, MusicMetadataReference } from "./entities/music-metadata.ts";
import { BASE_CACHE_DIR, IMAGES_STORAGE_DIR } from "./lib/cache-service.ts";
import { audioFileExtension } from "./lib/music-media-types.ts";
import { convertImageToJpeg } from "./lib/image-conversion-service.ts";
import { findMusicMetadata, saveMusicMedia } from "./repositories/music-metadata-repository.ts";

const MAX_MEDIA_BYTES = 60 * 1024 * 1024;

interface CachedMusicMedia {
  cachePath: string | null;
  state: MusicMediaState;
}

interface MusicMediaOptions {
  database: DrizzleDatabase;
  directory?: string;
  fetchMedia?: (url: string) => Promise<Response>;
  convertArtwork?: typeof convertImageToJpeg;
}

async function fileExists(directory: string, key: string | null) {
  if (key === null || !/^music\/[a-f0-9]{64}\.(?:jpg|mp3|m4a|aac|ogg|webm|wav|flac)$/u.test(key)) {
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
  kind: "audio" | "artwork",
  id: string,
  directory: string,
  options: MusicMediaOptions,
): Promise<CachedMusicMedia> {
  const url = new globalThis.URL(source);
  if (url.protocol !== "https:" || url.username || url.password) {
    return { cachePath: null, state: "unsupported" };
  }
  const response = await (
    options.fetchMedia ??
    (async (value) =>
      await globalThis.fetch(value, { signal: globalThis.AbortSignal.timeout(20_000) }))
  )(source);
  if (!response.ok) {
    await response.body?.cancel();
    return { cachePath: null, state: "failed" };
  }
  const contentType =
    response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const extension = kind === "artwork" ? "jpg" : audioFileExtension(contentType);
  if (extension === undefined) {
    await response.body?.cancel();
    return { cachePath: null, state: "unsupported" };
  }
  const received = await readBounded(response);
  const bytes =
    kind === "artwork" ? await (options.convertArtwork ?? convertImageToJpeg)(received) : received;
  const key = `music/${createHash("sha256").update(`${id}:${kind}`).digest("hex")}.${extension}`;
  const destination = path.join(directory, key);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return { cachePath: key, state: "available" };
}

// Shared by the one-time operator and future queue workers; failures never escape into ingestion.
export async function processMusicMedia(
  reference: MusicMetadataReference,
  options: MusicMediaOptions,
) {
  const directory = options.directory ?? path.resolve(BASE_CACHE_DIR, IMAGES_STORAGE_DIR);
  for (const kind of ["audio", "artwork"] as const) {
    const current = findMusicMetadata(options.database, reference);
    if (!current) {
      return null;
    }
    const source = kind === "audio" ? current.audioSourceUrl : current.artworkSourceUrl;
    const cached = kind === "audio" ? current.audioCachePath : current.artworkCachePath;
    let result: CachedMusicMedia = { cachePath: null, state: "unavailable" };
    // oxlint-disable-next-line no-await-in-loop -- Limit media memory and network pressure per asset.
    if (await fileExists(directory, cached)) {
      result = { cachePath: cached, state: "available" };
    } else if (source !== null) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Process audio and artwork independently with bounded memory.
        result = await downloadMedia(source, kind, current.id, directory, options);
      } catch {
        result = { cachePath: null, state: "failed" };
      }
    }
    saveMusicMedia(options.database, reference, kind, source, result.cachePath, result.state);
  }
  return findMusicMetadata(options.database, reference) ?? null;
}
