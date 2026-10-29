import { useDrizzle } from "./database/client.ts";
import type { StoriesManifestReport } from "./report-types.ts";
import {
  cacheReceivedAudio,
  processMusicMedia,
  processMusicArtwork,
  type MusicMediaOptions,
} from "./music-media-service.ts";
import { readMusicObservations } from "./repositories/music-metadata-repository.ts";
import { findStoryAudio, saveStoryAudioMedia } from "./repositories/story-audio-repository.ts";

export async function processStoryAudio(mediaPk: string, options: MusicMediaOptions) {
  const current = findStoryAudio(options.database, mediaPk);
  if (!current) {
    return null;
  }
  const result = await cacheReceivedAudio(
    `story:${mediaPk}`,
    current.sourceUrl,
    current.cachePath,
    options,
    current.mimeType,
  );
  saveStoryAudioMedia(options.database, current, result.cachePath, result.state, result.durationMs);
  return findStoryAudio(options.database, mediaPk) ?? null;
}

// Enrich the current report; historical cache recovery remains a local one-time operation.
export async function cacheReportAudio(
  report: StoriesManifestReport,
  options: Omit<MusicMediaOptions, "database"> & { database?: MusicMediaOptions["database"] } = {},
) {
  const settings = { ...options, database: options.database ?? useDrizzle() };
  const mediaPks = new Set(
    report.output.users.flatMap(({ stories }) =>
      stories.filter(({ status }) => status === "ok").map(({ media_pk }) => media_pk),
    ),
  );
  const assets = new Set<string>();
  for (const mediaPk of mediaPks) {
    for (const { metadata } of readMusicObservations(settings.database, mediaPk)) {
      if (assets.has(metadata.id)) {
        continue;
      }
      assets.add(metadata.id);
      // oxlint-disable-next-line no-await-in-loop -- Bound memory and network pressure per audio source.
      await processMusicMedia(metadata, settings);
      // oxlint-disable-next-line no-await-in-loop -- Process each asset's cover with bounded memory.
      await processMusicArtwork(metadata, settings);
    }
    // oxlint-disable-next-line no-await-in-loop -- Publish each story's independent soundtrack before the next download.
    await processStoryAudio(mediaPk, settings);
  }
}
