import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { createDrizzle } from "../sdk/database/client.ts";
import { APP_CACHE_DIR, APP_DATABASE_PATH } from "../sdk/lib/app-data-paths.ts";
import { StoryItemSchema } from "../sdk/lib/story-schemas.ts";
import { CacheMetadataRepository } from "../sdk/repositories/cache-metadata-repository.ts";

const CacheStorySchema = StoryItemSchema.pick({
  pk: true,
  story_locations: true,
  story_bloks_stickers: true,
  story_music_stickers: true,
}).strip();

export async function runCacheMetadataEnrichment(options: {
  databasePath: string;
  cacheDirectory: string;
}) {
  const databaseFile = await stat(options.databasePath);
  if (!databaseFile.isFile()) {
    throw new Error("An initialized database file is required");
  }
  const database = createDrizzle(options.databasePath);
  try {
    const repository = new CacheMetadataRepository(database);
    repository.requireInitialized();
    const totals = { enriched: 0, partial: 0, skipped: 0, uncertain: 0, invalid: 0, failed: 0 };
    const entries = await readdir(options.cacheDirectory, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .toSorted((a, b) => a.name.localeCompare(b.name));
    for (const file of files) {
      let story;
      try {
        // oxlint-disable-next-line no-await-in-loop -- Bound memory and commit one cached story at a time.
        const contents = await readFile(path.join(options.cacheDirectory, file.name), "utf-8");
        const raw: unknown = JSON.parse(contents);
        const parsed = CacheStorySchema.safeParse(raw);
        if (!parsed.success) {
          totals.invalid += 1;
          continue;
        }
        story = parsed.data;
      } catch {
        totals.invalid += 1;
        continue;
      }
      try {
        const result = repository.enrich(story);
        for (const key of ["enriched", "partial", "skipped", "uncertain", "invalid"] as const) {
          totals[key] += result[key];
        }
      } catch {
        totals.failed += 1;
      }
    }
    return totals;
  } finally {
    database.$client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runCacheMetadataEnrichment({
      databasePath: APP_DATABASE_PATH,
      cacheDirectory: path.join(APP_CACHE_DIR, "stories"),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.failed > 0 || result.invalid > 0) {
      process.exitCode = 1;
    }
  } catch {
    process.stderr.write(
      "Cache enrichment could not start; verify the initialized database and cache directory.\n",
    );
    process.exitCode = 1;
  }
}
