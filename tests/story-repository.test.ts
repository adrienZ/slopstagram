import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { InstagramUserRepository } from "../sdk/entities/instagram-user.ts";
import { StoryRepository } from "../sdk/entities/story.ts";

describe("StoryRepository", () => {
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

    assert.deepEqual(await repository.findByMediaPk("story-1"), {
      accessibility_caption: "Updated",
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
    const storedStory = database.$client
      .prepare("SELECT accessibilityCaption, mediaType, originalHeight, originalWidth FROM stories")
      .all()
      .map((row) => Object.fromEntries(Object.entries(row)))[0];
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
    assert.deepEqual(stickers, [{ kind: "hashtag", label: "hashtag:#structured" }]);
    const locations = database.$client
      .prepare("SELECT label FROM story_locations")
      .all()
      .map((row) => Object.fromEntries(Object.entries(row)));
    assert.deepEqual(locations, [{ label: "Paris" }]);
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

    assert.deepEqual(await repository.listByUsername("timeline-user"), [
      {
        full_name: "Timeline User",
        locations: [],
        owner_pk: "user-pk",
        story: { media_type: 2, pk: "newer-story", taken_at: 1_767_312_000 },
        stickers: [],
        taken_at: 1_767_312_000,
        username: "timeline-user",
      },
      {
        full_name: "Timeline User",
        locations: [],
        owner_pk: "user-pk",
        story: {
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
