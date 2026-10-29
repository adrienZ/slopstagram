import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test, expect } from "vitest";

test("audio cache migration updates all audio paths and preserves artwork", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE metadata_music (audioCachePath TEXT, artworkCachePath TEXT); CREATE TABLE metadata_music_partial (audioCachePath TEXT); CREATE TABLE story_audio (cachePath TEXT)",
    );
    db.exec(
      "INSERT INTO metadata_music VALUES ('music/track.m4a', 'music/cover.jpg'); INSERT INTO metadata_music_partial VALUES ('music/partial.m4a'); INSERT INTO story_audio VALUES ('music/story.m4a')",
    );
    const migration = readFileSync(
      new globalThis.URL(
        "../sdk/database/migrations/20261027120000_separate_audio_cache/migration.sql",
        import.meta.url,
      ),
      "utf-8",
    );
    db.exec(migration);
    expect(db.prepare("SELECT audioCachePath FROM metadata_music").get()?.audioCachePath).toBe(
      "audio/track.m4a",
    );
    expect(db.prepare("SELECT artworkCachePath FROM metadata_music").get()?.artworkCachePath).toBe(
      "music/cover.jpg",
    );
    expect(
      db.prepare("SELECT audioCachePath FROM metadata_music_partial").get()?.audioCachePath,
    ).toBe("audio/partial.m4a");
    expect(db.prepare("SELECT cachePath FROM story_audio").get()?.cachePath).toBe(
      "audio/story.m4a",
    );
  } finally {
    db.close();
  }
});
