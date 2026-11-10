import { expect, test } from "vitest";
import { loadAccountTimeline } from "../app/loaders/account-timeline.ts";
import { getRouter } from "../app/router.tsx";
import { loadSidebarUsers } from "../app/loaders/sidebar-users.ts";
import {
  cachedArtworkFile,
  cachedAudioFile,
} from "@@/core/domains/media-store/cached-media-files.ts";
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
  expect(media.image.avatar("alice")).toStrictEqual(keyOfUrl(user.avatarPath));
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
  expect(media.image.storyPreview("700000000000906")).toStrictEqual(keyOfUrl(story.preview));
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
  expect(media.image.fromStoredPath("images/avatars/alice.jpg")?.url).toBe(
    "/media/avatars/alice.jpg",
  );
  expect(media.audio.fromStoredPath("audio/a.m4a")?.url).toBe("/media/audio/a.m4a");
  expect(media.image.fromStoredPath("images/")).toBeNull();
  expect(media.image.fromStoredPath("audio/a.m4a")).toBeNull();
  expect(media.audio.fromStoredPath("images/avatars/alice.jpg")).toBeNull();
  expect(media.image.fromStoredPath("https://example.com/a.jpg")).toBeNull();
});

test("a cached audio URL resolves back to the key of its file, and the key back to its stored path", () => {
  const stored = `audio/${"a".repeat(64)}.m4a`;
  const audio = media.audio.fromStoredPath(stored);

  expect(audio).toStrictEqual({
    store: "audio",
    key: `${"a".repeat(64)}.m4a`,
    storedPath: stored,
    url: `/media/${stored}`,
  });
  expect(keyOfUrl(audio?.url ?? "")).toStrictEqual(audio);
});

test("a music artwork URL resolves back to the key of its image in the media store", () => {
  const key = `music/${"b".repeat(64)}.jpg`;
  const artwork = media.image.artwork(key);

  expect(artwork).toStrictEqual({
    store: "images",
    key,
    storedPath: `images/${key}`,
    url: `/media/${key}`,
  });
  expect(keyOfUrl(artwork?.url ?? "")).toStrictEqual(artwork);
  expect(media.image.fromStoredPath(`images/${key}`)).toStrictEqual(artwork);
});

test("a path that is not a valid music key has no file", () => {
  const hash = "c".repeat(64);

  expect(media.audio.fromStoredPath(null)).toBeNull();
  expect(media.audio.fromStoredPath(`audio/${hash}.jpg`)).toBeNull();
  expect(media.audio.fromStoredPath(`audio/${hash}.txt`)).toBeNull();
  expect(media.audio.fromStoredPath(`images/${hash}.m4a`)).toBeNull();
  expect(media.image.artwork(null)).toBeNull();
  expect(media.image.artwork(`music/${hash}.gif`)).toBeNull();
  expect(media.image.artwork(`audio/${hash}.jpg`)).toBeNull();
});

test("the files the pipeline writes resolve back through the media record, by their stored path or key", () => {
  const audio = cachedAudioFile("asset-1", "m4a");
  const artwork = cachedArtworkFile("asset-1");

  expect(audio.storedPath).toMatch(/^audio\/[a-f0-9]{64}\.m4a$/u);
  expect(media.audio.fromStoredPath(audio.storedPath)).toStrictEqual(audio);
  expect(artwork.key).toMatch(/^music\/[a-f0-9]{64}\.jpg$/u);
  expect(media.image.artwork(artwork.key)).toStrictEqual(artwork);
  expect(media.image.fromStoredPath(media.image.avatar("1").storedPath)).toStrictEqual(
    media.image.avatar("1"),
  );
  expect(media.image.fromStoredPath(media.image.storyPreview("2").storedPath)).toStrictEqual(
    media.image.storyPreview("2"),
  );
});
