import { expect, test } from "vitest";
import { loadAccountTimeline } from "../app/loaders/account-timeline.ts";
import { getRouter } from "../app/router.tsx";
import { loadSidebarUsers } from "../app/loaders/sidebar-users.ts";
import { media } from "@@/core/domains/media-store/media-urls.ts";
import { createTestRuntime, useSharedTestRuntime } from "./setup/test-runtime.ts";
import { pageNow, seedPageDatabase, timelineAccount } from "./ui/seeded-pages.ts";
import { saveSummaryUsers } from "./test-database.ts";

const shared = useSharedTestRuntime(seedPageDatabase);

/** The key the media route resolves for a URL: the router hands the route its splat. */
function keyOfUrl(url: string) {
  const [, params] = getRouter().getMatchedRoutes(url);
  return media.fromRequest(params._splat);
}

test("an avatar URL a loader builds resolves back to the key of its image in the media store", async (context) => {
  const runtime = await createTestRuntime(context);
  await saveSummaryUsers(runtime, ["alice"]);
  const [user] = loadSidebarUsers(runtime);

  expect(user.avatarPath).toBe("/media/avatars/alice.jpg");
  expect(keyOfUrl(user.avatarPath)).toStrictEqual({
    store: "images",
    key: "avatars/alice.jpg",
    storedPath: "images/avatars/alice.jpg",
    url: "/media/avatars/alice.jpg",
  });
  expect(media.avatar("alice")).toStrictEqual(keyOfUrl(user.avatarPath));
});

test("a story preview URL a loader builds resolves back to the key of its image in the media store", () => {
  const { stories } = loadAccountTimeline(shared.runtime, timelineAccount, pageNow);
  const [story] = stories;

  expect(story.preview).toBe("/media/story-previews/700000000000906.jpg");
  expect(keyOfUrl(story.preview)).toStrictEqual({
    store: "images",
    key: "story-previews/700000000000906.jpg",
    storedPath: "images/story-previews/700000000000906.jpg",
    url: "/media/story-previews/700000000000906.jpg",
  });
  expect(media.storyPreview("700000000000906")).toStrictEqual(keyOfUrl(story.preview));
});

test("an audio URL resolves to a key of the audio store, and a type outside its folder resolves to nothing", () => {
  expect(keyOfUrl(`/media/audio/${"a".repeat(64)}.m4a`)).toStrictEqual({
    store: "audio",
    key: `${"a".repeat(64)}.m4a`,
    storedPath: `audio/${"a".repeat(64)}.m4a`,
    url: `/media/audio/${"a".repeat(64)}.m4a`,
  });
  expect(keyOfUrl("/media/audio/avatar.jpg")).toBeNull();
  expect(keyOfUrl("/media/avatars/alice.mp3")).toBeNull();
  expect(keyOfUrl("/media/avatars/alice.png")).toBeNull();
});

test("a stored path resolves to the URL serving it, and a path without a known store or a key resolves to nothing", () => {
  expect(media.fromStoredPath("images/avatars/alice.jpg")?.url).toBe("/media/avatars/alice.jpg");
  expect(media.fromStoredPath("audio/a.m4a")?.url).toBe("/media/audio/a.m4a");
  expect(media.fromStoredPath("images/")).toBeNull();
  expect(media.fromStoredPath("https://example.com/a.jpg")).toBeNull();
});
