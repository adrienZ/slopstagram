import type { StoriesManifestReport } from "@@/core/fetch-run/report-types.ts";
import {
  cacheReceivedAudio,
  processMusicMedia,
  processMusicArtwork,
  type MusicMediaOptions,
} from "@@/core/music/music-media.ts";
import {
  type StoryRepository,
  storyRepository,
} from "@@/core/database/repositories/story-repository.ts";

interface StoryAudioOptions extends Omit<MusicMediaOptions, "storyRepository"> {
  storyRepository?: Pick<
    StoryRepository,
    | "findMusicMetadata"
    | "findStoryAudio"
    | "listMusicObservations"
    | "saveMusicMedia"
    | "saveStoryAudioMedia"
  >;
}

export async function processStoryAudio(mediaPk: string, options: StoryAudioOptions) {
  const repository = options.storyRepository ?? storyRepository;
  const current = repository.findStoryAudio(mediaPk);
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
  repository.saveStoryAudioMedia(current, result.cachePath, result.state, result.durationMs);
  return repository.findStoryAudio(mediaPk) ?? null;
}

// Enrich the current report; historical cache recovery remains a local one-time operation.
export async function cacheReportAudio(report: StoriesManifestReport, options: StoryAudioOptions) {
  const repository = options.storyRepository ?? storyRepository;
  const settings = { ...options, storyRepository: repository };
  const mediaPks = new Set(
    report.output.users.flatMap(({ stories }) =>
      stories.filter(({ status }) => status === "ok").map(({ media_pk }) => media_pk),
    ),
  );
  const assets = new Set<string>();
  for (const mediaPk of mediaPks) {
    for (const { metadata } of repository.listMusicObservations(mediaPk)) {
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
