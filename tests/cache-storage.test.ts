import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { BASE_CACHE_DIR, createFileCacheStorage } from "@@/core/media-store/cache-storage.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";
import { storyItem } from "./mock-helpers.ts";

test("file cache storage creates nothing until a store is written", async (context) => {
  const parent = await mkdtemp(path.join(tmpdir(), "slopstagram-cache-"));
  context.onTestFinished(async () => {
    await rm(parent, { force: true, recursive: true });
  });
  const root = path.join(parent, "cache");

  const storage = createFileCacheStorage(root);

  expect(existsSync(root)).toBe(false);

  await storage.stories.setItem("m1.json", storyItem("m1"));
  await storage.images.setItemRaw("avatars/a.jpg", Buffer.from("jpeg"));
  await storage.audio.setItemRaw("track.mp3", Buffer.from("mp3"));

  const layout = await readdir(root);

  expect(layout.toSorted()).toStrictEqual(["audio", "images", "stories"]);
  expect(await readdir(path.join(root, "images", "avatars"))).toStrictEqual(["a.jpg"]);
  expect(await storage.stories.getItem("m1.json")).toStrictEqual(storyItem("m1"));
});

test("the test runtime keeps its stores in memory", async (context) => {
  const runtime = await createTestRuntime(context);

  await runtime.storage.images.setItemRaw("probe/in-memory.jpg", Buffer.from("jpeg"));

  expect(await runtime.storage.images.hasItem("probe/in-memory.jpg")).toBe(true);
  expect(existsSync(path.join(BASE_CACHE_DIR, "images", "probe", "in-memory.jpg"))).toBe(false);
});
