import assert from "node:assert/strict";
import { test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { getStoryAnnotations } from "../sdk/story-sticker-location-service.ts";

test("extracts content-only labels including fallback forms and literal colons", () => {
  const { stickers } = getStoryAnnotations({
    pk: "raw",
    story_bloks_stickers: [
      { bloks_sticker: { sticker_data: { ig_mention: { username: "friend" } } } },
      { bloks_sticker: { sticker_data: { ig_mention: { full_name: "Friend Name" } } } },
    ],
    story_music_stickers: [
      { music_asset_info: { title: "Song", display_artist: "Artist" } },
      { music_asset_info: { title: "music: a title" } },
    ],
    story_hashtags: [{ hashtag: "weekend" }, { hashtag: "#ready" }],
    story_link_stickers: [
      { url: "https://example.com/a:b", title: "Read: this" },
      { url: "https://example.com" },
      { title: "Only a title" },
    ],
    story_locations: [{ location: { name: "Paris", address: "France" } }],
  });
  assert.deepEqual(
    stickers.map(({ kind, label }) => ({ kind, label })),
    [
      { kind: "mention", label: "@friend" },
      { kind: "mention", label: "Friend Name" },
      { kind: "music", label: "Song - Artist" },
      { kind: "music", label: "music: a title" },
      { kind: "hashtag", label: "#weekend" },
      { kind: "hashtag", label: "#ready" },
      { kind: "link", label: "Read: this (https://example.com/a:b)" },
      { kind: "link", label: "https://example.com" },
      { kind: "link", label: "Only a title" },
      { kind: "location", label: "Paris, France" },
    ],
  );
});

test("normalizes legacy explicit annotations and keeps raw content intact", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  const repository = new StoryRepository(database);
  await repository.save({
    pk: "explicit",
    annotations: {
      locations: [],
      stickers: [
        { kind: "mention", label: "mention:@friend" },
        { kind: "mention", label: "mention:@friend" },
        { kind: "music", label: "music:Song - Artist" },
        { kind: "hashtag", label: "hashtag:#weekend" },
        { kind: "link", label: "link:https://example.com/a:b" },
        { kind: "location", label: "location:Paris" },
        { kind: "custom", label: "mention:@friend" },
      ],
    },
  });
  const stored = repository.findByMediaPk("explicit");
  assert.ok(stored);
  assert.deepEqual(
    stored.annotations?.stickers.map(({ label }) => label),
    [
      "@friend",
      "@friend",
      "Song - Artist",
      "#weekend",
      "https://example.com/a:b",
      "Paris",
      "mention:@friend",
    ],
  );
  await repository.save(stored);
  assert.deepEqual(repository.findByMediaPk("explicit"), stored);
  await repository.save({
    pk: "raw",
    story_music_stickers: [{ music_asset_info: { title: "music: a title" } }],
  });
  assert.equal(repository.findByMediaPk("raw")?.annotations?.stickers[0]?.label, "music: a title");
});
