import assert from "node:assert/strict";
import { test } from "vitest";
import { groupTimelineStickers, formatStickerLabel } from "../server/timeline-stickers.ts";
import { presentSticker } from "../server/sticker-presentation.ts";
import type { UserTimelineStory } from "../sdk/repositories/story-repository.ts";

test("links mentions only to saved accounts and preserves the canonical username in URLs", () => {
  assert.equal(
    presentSticker("mention", " @ALICE ", [
      { username: "alice", avatarPath: "/media/avatars/alice.jpg" },
      { username: "bob", avatarPath: "/media/avatars/saved.jpg" },
    ]).profileUrl,
    "/users/alice",
  );
  assert.equal(
    presentSticker("mention", "@charlie", [
      { username: "alice", avatarPath: "/media/avatars/saved.jpg" },
      { username: "bob", avatarPath: "/media/avatars/saved.jpg" },
    ]).profileUrl,
    undefined,
  );
  assert.equal(
    presentSticker("music", "@alice", [
      { username: "alice", avatarPath: "/media/avatars/saved.jpg" },
    ]).profileUrl,
    undefined,
  );
  assert.equal(
    presentSticker("mention", "@ALICE", [
      { username: "alice", avatarPath: "/media/avatars/alice.jpg" },
    ]).avatarUrl,
    "/media/avatars/alice.jpg",
  );
  assert.equal(formatStickerLabel("mention", "alice"), "@alice");
  assert.equal(formatStickerLabel("mention", "@alice"), "@alice");
});

test("orders sticker kinds as location, mention, link, music, hashtag", () => {
  const groups = groupTimelineStickers(
    [],
    ["hashtag", "poll", "music", "link", "mention", "location"],
  );
  assert.deepEqual(
    groups.map((group) => group.kind),
    ["location", "mention", "link", "music", "hashtag", "poll"],
  );
});

test("groups the full sticker history by kind and story while retaining empty database kinds", () => {
  const stories: Array<UserTimelineStory> = Array.from({ length: 60 }, (_, index) => ({
    full_name: "Fixture",
    username: "fixture",
    owner_pk: "fixture",
    locations: [],
    stickers: [],
    taken_at: 1_767_225_600 + index,
    story: {
      pk: `story-${index}`,
      annotations: {
        locations: [],
        stickers: [
          { kind: "mention", label: `@person-${index}` },
          { kind: "mention", label: `@person-${index}` },
        ],
      },
    },
  }));
  const groups = groupTimelineStickers(stories, ["mention", "music", "poll"]);
  assert.deepEqual(
    groups.map((group) => group.kind),
    ["mention", "music", "poll"],
  );
  assert.equal(groups[0]?.stories.length, 60);
  assert.equal(groups[0]?.stories[0]?.mediaPk, "story-59");
  assert.equal(groups[0]?.stories.at(-1)?.mediaPk, "story-0");
  assert.equal(groups[0]?.stories[0]?.labels.length, 2);
  assert.deepEqual(groups[1]?.stories, []);
  assert.deepEqual(groups[2]?.stories, []);
});
