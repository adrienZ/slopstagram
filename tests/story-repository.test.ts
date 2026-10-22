import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { InstagramUserRepository } from "../sdk/entities/instagram-user.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";

describe("StoryRepository", () => {
  test("lists only stories published in the last 24 hours without deleting the archive", async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.after(() => {
      database.$client.close();
    });
    const repository = new StoryRepository(database);
    await new InstagramUserRepository(database).save({
      full_name: "Feed User",
      id: "feed-id",
      pk: "feed-pk",
      username: "feed-user",
    });
    const owner = { pk: "feed-pk", username: "feed-user" };
    await Promise.all(
      [
        ["expired", 1_792_612_799],
        ["boundary", 1_792_612_800],
        ["active", 1_792_612_801],
        ["now", 1_792_699_200],
        ["future", 1_792_699_201],
      ].map(async ([pk, taken_at]) => {
        await repository.save({ pk: String(pk), taken_at: Number(taken_at) }, owner);
      }),
    );
    await repository.save({ pk: "undated" }, owner);
    // A second observation of the same story must not duplicate it in the feed.
    await repository.save({ pk: "active", taken_at: 1_792_612_801 }, owner);
    assert.deepEqual(
      repository.listActive(new Date(1_792_699_200_000)).map((entry) => entry.story.pk),
      ["now", "active"],
    );
    assert.ok(repository.listByUsername("feed-user").some((entry) => entry.story.pk === "expired"));
  });

  test("stores story details in relational tables", async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.after(() => {
      database.$client.close();
    });
    const repository = new StoryRepository(database);

    await repository.save({ media_type: 1, pk: "story-1" });
    await repository.save({
      accessibility_caption: "Updated",
      image_versions2: {
        candidates: [{ height: 100, url: "https://example.com/image.jpg", width: 80 }],
      },
      media_type: 2,
      original_height: 1920,
      original_width: 1080,
      pk: "story-1",
      story_hashtags: [{ hashtag: "structured" }],
      story_locations: [{ location: { name: "Paris" } }],
      video_versions: [
        { height: 1920, type: 0, url: "https://example.com/video.mp4", width: 1080 },
      ],
    });

    assert.deepEqual(repository.findByMediaPk("story-1"), {
      accessibility_caption: "Updated",
      annotations: {
        locations: ["Paris"],
        sources: ["story_hashtags", "story_locations"],
        stickers: [
          { kind: "hashtag", label: "hashtag:#structured", source: "story_hashtags" },
          { kind: "location", label: "Paris", source: "story_locations" },
        ],
      },
      image_versions2: {
        candidates: [{ height: 100, url: "https://example.com/image.jpg", width: 80 }],
      },
      media_type: 2,
      original_height: 1920,
      original_width: 1080,
      pk: "story-1",
      video_versions: [
        { height: 1920, type: 0, url: "https://example.com/video.mp4", width: 1080 },
      ],
    });
    const [storedStory] = database.$client
      .prepare("SELECT accessibilityCaption, mediaType, originalHeight, originalWidth FROM stories")
      .all()
      .map((row) => Object.fromEntries(Object.entries(row)));
    assert.deepEqual(storedStory, {
      accessibilityCaption: "Updated",
      mediaType: 2,
      originalHeight: 1920,
      originalWidth: 1080,
    });
    const imageVersions = database.$client
      .prepare("SELECT height, url, width FROM story_image_versions")
      .all()
      .map((row) => Object.fromEntries(Object.entries(row)));
    assert.deepEqual(imageVersions, [
      { height: 100, url: "https://example.com/image.jpg", width: 80 },
    ]);
    const stickers = database.$client
      .prepare("SELECT kind, label FROM story_stickers")
      .all()
      .map((row) => Object.fromEntries(Object.entries(row)));
    assert.deepEqual(stickers, [
      { kind: "hashtag", label: "hashtag:#structured" },
      { kind: "location", label: "Paris" },
    ]);
    const storyColumns = database.$client.prepare("PRAGMA table_info(stories)").all();
    assert.equal(
      storyColumns.some((column) => String(column.name).toLowerCase().includes("json")),
      false,
    );
  });

  test("lists a user's stories by their Instagram publication date", async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.after(() => {
      database.$client.close();
    });
    const repository = new StoryRepository(database);
    const userRepository = new InstagramUserRepository(database);

    await userRepository.save({
      full_name: "Timeline User",
      id: "user-id",
      pk: "user-pk",
      username: "timeline-user",
    });

    await repository.save(
      {
        media_type: 1,
        pk: "older-story",
        story_hashtags: [{ hashtag: "weekend" }],
        taken_at: 1_767_225_600,
      },
      { full_name: "Timeline User", pk: "user-pk", username: "timeline-user" },
    );
    await repository.save(
      { media_type: 2, pk: "newer-story", taken_at: 1_767_312_000 },
      { full_name: "Timeline User", pk: "user-pk", username: "timeline-user" },
    );
    await repository.save(
      { media_type: 1, pk: "without-published-date" },
      {
        full_name: "Timeline User",
        pk: "user-pk",
        username: "timeline-user",
      },
    );

    assert.deepEqual(repository.listByUsername("timeline-user"), [
      {
        full_name: "Timeline User",
        locations: [],
        owner_pk: "user-pk",
        story: {
          annotations: { locations: [], stickers: [], sources: [] },
          media_type: 2,
          pk: "newer-story",
          taken_at: 1_767_312_000,
        },
        stickers: [],
        taken_at: 1_767_312_000,
        username: "timeline-user",
      },
      {
        full_name: "Timeline User",
        locations: [],
        owner_pk: "user-pk",
        story: {
          annotations: {
            locations: [],
            sources: ["story_hashtags"],
            stickers: [{ kind: "hashtag", label: "hashtag:#weekend", source: "story_hashtags" }],
          },
          media_type: 1,
          pk: "older-story",
          taken_at: 1_767_225_600,
        },
        stickers: ["hashtag:#weekend"],
        taken_at: 1_767_225_600,
        username: "timeline-user",
      },
    ]);
  });
});
