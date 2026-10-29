import { test, expect } from "vitest";
import { groupTimelineStickers, formatStickerLabel } from "../server/timeline-stickers.ts";
import { presentSticker } from "../server/sticker-presentation.ts";
import type { UserTimelineStory } from "../sdk/repositories/story-repository.ts";

test("links mentions only to saved accounts and preserves the canonical username in URLs", () => {
  expect(
    presentSticker("mention", " @ALICE ", [
      { username: "alice", avatarPath: "/media/avatars/alice.jpg" },
      { username: "bob", avatarPath: "/media/avatars/saved.jpg" },
    ]).profileUrl,
  ).toBe("/users/alice");
  expect(
    presentSticker("mention", "@charlie", [
      { username: "alice", avatarPath: "/media/avatars/saved.jpg" },
      { username: "bob", avatarPath: "/media/avatars/saved.jpg" },
    ]).profileUrl,
  ).toBe(undefined);
  expect(
    presentSticker("music", "@alice", [
      { username: "alice", avatarPath: "/media/avatars/saved.jpg" },
    ]).profileUrl,
  ).toBe(undefined);
  expect(
    presentSticker("mention", "@ALICE", [
      { username: "alice", avatarPath: "/media/avatars/alice.jpg" },
    ]).avatarUrl,
  ).toBe("/media/avatars/alice.jpg");
  expect(formatStickerLabel("mention", "alice")).toBe("@alice");
  expect(formatStickerLabel("mention", "@alice")).toBe("@alice");
});

test("orders sticker kinds as location, mention, link, music, hashtag", () => {
  const groups = groupTimelineStickers(
    [],
    ["hashtag", "poll", "music", "link", "mention", "location"],
  );
  expect(groups.map((group) => group.kind)).toStrictEqual([
    "location",
    "mention",
    "link",
    "music",
    "hashtag",
    "poll",
  ]);
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
  expect(groups.map((group) => group.kind)).toStrictEqual(["mention", "music", "poll"]);
  expect(groups[0]?.stories.length).toBe(60);
  expect(groups[0]?.stories[0]?.mediaPk).toBe("story-59");
  expect(groups[0]?.stories.at(-1)?.mediaPk).toBe("story-0");
  expect(groups[0]?.stories[0]?.labels.length).toBe(2);
  expect(groups[1]?.stories).toStrictEqual([]);
  expect(groups[2]?.stories).toStrictEqual([]);
});
