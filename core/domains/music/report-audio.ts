import type { StoriesManifestReport } from "@@/core/domains/fetch-run/report-types.ts";
import {
  cacheReceivedAudio,
  processMusicMedia,
  processMusicArtwork,
} from "@@/core/domains/music/music-media.ts";
import type { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";

type StoryAudioRuntime = Pick<Runtime, "fetchMedia" | "storage"> & {
  stories: Pick<
    StoryRepository,
    | "findMusicMetadata"
    | "findStoryAudio"
    | "listMusicObservations"
    | "saveMusicMedia"
    | "saveStoryAudioMedia"
  >;
};

async function processStoryAudio(runtime: StoryAudioRuntime, mediaPk: string) {
  const repository = runtime.stories;
  const current = repository.findStoryAudio(mediaPk);
  if (!current) {
    return null;
  }
  const result = await cacheReceivedAudio(
    runtime,
    `story:${mediaPk}`,
    current.sourceUrl,
    current.cachePath,
    current.mimeType,
  );
  repository.saveStoryAudioMedia(current, result.cachePath, result.state, result.durationMs);
  return repository.findStoryAudio(mediaPk) ?? null;
}

// Enrich the current report; historical cache recovery remains a local one-time operation.
export async function cacheReportAudio(runtime: StoryAudioRuntime, report: StoriesManifestReport) {
  const repository = runtime.stories;
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
      await processMusicMedia(runtime, metadata);
      // oxlint-disable-next-line no-await-in-loop -- Process each asset's cover with bounded memory.
      await processMusicArtwork(runtime, metadata);
    }
    // oxlint-disable-next-line no-await-in-loop -- Publish each story's independent soundtrack before the next download.
    await processStoryAudio(runtime, mediaPk);
  }
}
