import { expect, test } from "vitest";
import { loadAccountTimeline } from "@/loaders/account-timeline.ts";
import { useSharedTestRuntime } from "@@/tests/setup/test-runtime.ts";
import {
  captionedStoryPk,
  mentionedAccount,
  pageNow,
  seedPageDatabase,
  timelineAccount,
} from "@@/tests/ui/seeded-pages.ts";

const shared = useSharedTestRuntime(seedPageDatabase);

test("returns the sticker groups of the account's stories, one per kind", () => {
  const { stickerGroups } = loadAccountTimeline(shared.runtime, timelineAccount, pageNow);

  expect(stickerGroups.map(({ kind, stories }) => [kind, stories.length])).toStrictEqual([
    ["location", 1],
    ["mention", 4],
    ["music", 1],
  ]);
});

test("returns the tagged places that have a position, with the stories that tag them", () => {
  const { locations } = loadAccountTimeline(shared.runtime, timelineAccount, pageNow);

  expect(locations.places).toMatchObject([
    {
      name: "Fixture place 1",
      latitude: 48.8,
      longitude: 12.5,
      stories: [{ mediaPk: "700000000000903" }],
    },
  ]);
  expect(locations.unpositionedLocationCount).toBe(4);
});

test("returns story cards, newest first, with their stickers already presented", () => {
  const { stories } = loadAccountTimeline(shared.runtime, timelineAccount, pageNow);

  expect(stories.map(({ mediaPk }) => mediaPk)).toStrictEqual([
    "700000000000906",
    "700000000000903",
    "700000000000900",
    "700000000000129",
    "700000000000122",
    "700000000000107",
    "700000000000100",
    "700000000000116",
  ]);
  expect(stories.find(({ mediaPk }) => mediaPk === captionedStoryPk)?.stickerDetails).toEqual({
    stickers: [
      {
        kind: "mention",
        title: `@${mentionedAccount}`,
        label: `@${mentionedAccount}`,
        profileUrl: `/users/${mentionedAccount}`,
        avatarUrl: "/media/avatars/700000000000114.jpg",
      },
    ],
    music: [],
  });
  expect(
    stories.find(({ mediaPk }) => mediaPk === "700000000000900")?.stickerDetails?.music,
  ).toHaveLength(1);
});
