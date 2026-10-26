import assert from "node:assert/strict";
import { test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { CachedMusicStorySchema, enrichMusicMediaFromCache } from "../sdk/music-media-backfill.ts";

test("cache media enrichment preserves newer sources and exact labels without guessing repeated anonymous links", async () => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  try {
    const repository = new StoryRepository(database);
    await repository.save({
      pk: "story",
      story_music_stickers: [
        {
          id: "outer",
          music_asset_info: {
            audio_asset_id: "audio",
            title: "Song",
            display_artist: "Artist",
            progressive_download_url: "https://example.com/new",
          },
        },
        { music_asset_info: { title: "Same" } },
        { music_asset_info: { title: "Same" } },
      ],
    });
    const before = repository.findByMediaPk("story");
    const cached = CachedMusicStorySchema.parse({
      pk: "story",
      annotations: { malformed: true },
      story_music_stickers: [
        {
          id: "outer",
          music_asset_info: {
            audio_asset_id: "audio",
            progressive_download_url: "https://example.com/old",
            cover_artwork_uri: "https://example.com/cover",
          },
        },
        { music_asset_info: { title: "Same", cover_artwork_uri: "https://example.com/uncertain" } },
      ],
    });
    assert.deepEqual(enrichMusicMediaFromCache(database, cached), {
      enriched: 1,
      skipped: 0,
      uncertain: 1,
    });
    const after = new StoryRepository(database).findByMediaPk("story");
    assert.deepEqual(after?.annotations?.stickers, before?.annotations?.stickers);
    assert.deepEqual(after?.image_versions2, before?.image_versions2);
    const observations = after?.annotations?.musicObservations;
    assert.ok(observations);
    assert.equal(observations[0].metadata.audioSourceUrl, "https://example.com/new");
    assert.equal(observations[0].metadata.artworkSourceUrl, "https://example.com/cover");
    assert.equal(observations[1].metadata.artworkSourceUrl, null);
    assert.deepEqual(enrichMusicMediaFromCache(database, cached), {
      enriched: 0,
      skipped: 1,
      uncertain: 1,
    });
    assert.deepEqual(enrichMusicMediaFromCache(database, { ...cached, pk: "missing" }), {
      enriched: 0,
      skipped: 1,
      uncertain: 0,
    });
    assert.equal(repository.findByMediaPk("missing"), null);
    assert.deepEqual(
      enrichMusicMediaFromCache(
        database,
        CachedMusicStorySchema.parse({ pk: "story", story_music_stickers: null }),
      ),
      { enriched: 0, skipped: 1, uncertain: 0 },
    );
  } finally {
    database.$client.close();
  }
});
