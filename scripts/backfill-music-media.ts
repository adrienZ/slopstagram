import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { useDrizzle } from "../sdk/database/client.ts";
import { BASE_CACHE_DIR } from "../sdk/lib/cache-service.ts";
import { CachedMusicStorySchema, enrichMusicMediaFromCache } from "../sdk/music-media-backfill.ts";
import { processMusicMedia } from "../sdk/music-media-service.ts";
import {
  findMusicMetadata,
  listMusicMetadata,
} from "../sdk/repositories/music-metadata-repository.ts";

function parseCachedStory(contents: string) {
  try {
    const raw: unknown = JSON.parse(contents);
    const parsed = CachedMusicStorySchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// One-time operator: run migrations explicitly before this script; no Instagram requests.
const database = useDrizzle();
const counts = {
  files: 0,
  enriched: 0,
  skipped: 0,
  uncertain: 0,
  invalid: 0,
  audio: 0,
  artwork: 0,
  unavailableAudio: 0,
  unavailableArtwork: 0,
};
try {
  const references = listMusicMetadata(database);
  const first = references.at(0);
  if (first !== undefined) {
    findMusicMetadata(database, first);
  }
  const files = await readdir(path.join(BASE_CACHE_DIR, "stories"));
  for (const file of files.filter((name) => name.endsWith(".json")).toSorted()) {
    counts.files += 1;
    // oxlint-disable-next-line no-await-in-loop -- Inspect records sequentially without retaining raw payloads.
    const contents = await readFile(path.join(BASE_CACHE_DIR, "stories", file), "utf-8");
    const parsed = parseCachedStory(contents);
    if (parsed === null) {
      counts.invalid += 1;
      continue;
    }
    const result = enrichMusicMediaFromCache(database, parsed);
    counts.enriched += result.enriched;
    counts.skipped += result.skipped;
    counts.uncertain += result.uncertain;
  }
  const pending = listMusicMetadata(database);
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (;;) {
        const reference = pending.pop();
        if (reference === undefined) {
          break;
        }
        // oxlint-disable-next-line no-await-in-loop -- Four workers bound network and memory use during the one-time pass.
        const result = await processMusicMedia(reference, { database });
        if (result?.audioState === "available") {
          counts.audio += 1;
        } else {
          counts.unavailableAudio += 1;
        }
        if (result?.artworkState === "available") {
          counts.artwork += 1;
        } else {
          counts.unavailableArtwork += 1;
        }
      }
    }),
  );
  process.stdout.write(`${JSON.stringify(counts)}\n`);
} finally {
  database.$client.close();
}
