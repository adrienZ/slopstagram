import { Buffer } from "node:buffer";
import { type TestContext, expect, test } from "vitest";
import { getRouter } from "../app/router.tsx";
import { Route as mediaRoute, handleMediaRequest } from "../app/routes/media/$.ts";
import type { CacheStorage } from "@@/core/domains/media-store/cache-storage.ts";
import { createMemoryCacheStorage } from "./memory-storage.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";

/** The media route over a test runtime: its stores are the in-memory ones, nothing touches the disk. */
async function createMediaApp(context: TestContext, storage?: CacheStorage) {
  const runtime = await createTestRuntime(context, { storage });
  const router = getRouter();

  return {
    async saveMedia(store: "audio" | "images", key: string, contents: string) {
      await runtime.storage[store].setItemRaw(key, Buffer.from(contents));
    },
    /** Answers a request like TanStack Start does for a server route: HEAD falls back to GET. */
    async request(url: string, init?: RequestInit): Promise<Response> {
      const request = new globalThis.Request(`http://localhost${url}`, init);
      const [, params, route] = router.getMatchedRoutes(url);
      expect(route).toBe(mediaRoute);
      return await handleMediaRequest(runtime, request, params._splat);
    },
  };
}

function range(value: string): RequestInit {
  return { headers: { range: value } };
}

test("the media route serves cached JPEG images", async (context) => {
  const app = await createMediaApp(context);
  await app.saveMedia("images", "story-previews/story-1.jpg", "jpeg-bytes");

  const response = await app.request("/media/story-previews/story-1.jpg");

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-length")).toBe("10");
  expect(await response.text()).toBe("jpeg-bytes");
});

test("the media route rejects traversal, non-JPEG images and audio outside the audio folder", async (context) => {
  const app = await createMediaApp(context);
  await app.saveMedia("images", "story-previews/story-1.png", "png-bytes");
  await app.saveMedia("images", "avatars/audio.mp3", "mp3-bytes");

  const urls = [
    "/media/story-previews/story-1.png",
    "/media/avatars/audio.mp3",
    "/media/avatars/missing.jpg",
  ];
  const responses = await Promise.all(urls.map(async (url) => await app.request(url)));

  expect(responses.map((response) => response.status)).toStrictEqual(urls.map(() => 404));
});

/** Stores that hand back bytes for any key, as a driver that does not reject `..` would. */
function createPermissiveStorage(): CacheStorage {
  const storage = createMemoryCacheStorage();
  for (const store of [storage.audio, storage.images]) {
    Object.assign(store, { getItemRaw: async () => await Promise.resolve(Buffer.from("secret")) });
  }
  return storage;
}

test("the media route answers 404 for a key containing .. without relying on the storage driver", async (context) => {
  const app = await createMediaApp(context, createPermissiveStorage());

  const served = await app.request("/media/avatars/alice.jpg");
  expect(served.status).toBe(200);
  const urls = [
    "/media/..%2fsecret.jpg",
    "/media/avatars/..%2f..%2fsecret.jpg",
    "/media/avatars/..%2fsecret.jpg",
    "/media/audio/..%2fsecret.m4a",
    "/media/audio/..%2f..%2fsecret.m4a",
  ];
  const responses = await Promise.all(urls.map(async (url) => await app.request(url)));

  expect(responses.map((response) => response.status)).toStrictEqual(urls.map(() => 404));
});

test("the media route serves cached audio with seek ranges, HEAD, and missing or unsatisfiable files", async (context) => {
  const app = await createMediaApp(context);
  await app.saveMedia("audio", "recording.m4a", "0123456789");

  const response = await app.request("/media/audio/recording.m4a", range("bytes=3-6"));
  expect(response.status).toBe(206);
  expect(response.headers.get("content-type")).toBe("audio/mp4");
  expect(response.headers.get("content-range")).toBe("bytes 3-6/10");
  expect(response.headers.get("accept-ranges")).toBe("bytes");
  expect(await response.text()).toBe("3456");
  const suffix = await app.request("/media/audio/recording.m4a", range("bytes=-2"));
  expect(await suffix.text()).toBe("89");
  const tail = await app.request("/media/audio/recording.m4a", range("bytes=7-"));
  expect(await tail.text()).toBe("789");
  const invalid = await app.request("/media/audio/recording.m4a", range("bytes=10-"));
  expect(invalid.status).toBe(416);
  expect(invalid.headers.get("content-range")).toBe("bytes */10");
  const head = await app.request("/media/audio/recording.m4a", { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(head.headers.get("content-length")).toBe("10");
  expect(await head.text()).toBe("");
  const missing = await app.request("/media/audio/missing.mp3");
  expect(missing.status).toBe(404);
});

test("the media route answers a range by slicing the stored bytes", async (context) => {
  const app = await createMediaApp(context);
  await app.saveMedia("audio", "recording.m4a", "0123456789");

  const startOnly = await app.request("/media/audio/recording.m4a", range("bytes=4-"));
  expect(startOnly.status).toBe(206);
  expect(startOnly.headers.get("content-range")).toBe("bytes 4-9/10");
  expect(startOnly.headers.get("content-length")).toBe("6");
  expect(await startOnly.text()).toBe("456789");

  const startAndEnd = await app.request("/media/audio/recording.m4a", range("bytes=2-5"));
  expect(startAndEnd.status).toBe(206);
  expect(startAndEnd.headers.get("content-range")).toBe("bytes 2-5/10");
  expect(startAndEnd.headers.get("content-length")).toBe("4");
  expect(await startAndEnd.text()).toBe("2345");

  const endBeyondSize = await app.request("/media/audio/recording.m4a", range("bytes=8-99"));
  expect(endBeyondSize.status).toBe(206);
  expect(endBeyondSize.headers.get("content-range")).toBe("bytes 8-9/10");
  expect(await endBeyondSize.text()).toBe("89");

  for (const outOfBounds of ["bytes=10-12", "bytes=50-", "bytes=6-3", "bytes=-"]) {
    // oxlint-disable-next-line no-await-in-loop -- Each unsatisfiable range is asserted on its own.
    const response = await app.request("/media/audio/recording.m4a", range(outOfBounds));
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */10");
    // oxlint-disable-next-line no-await-in-loop -- Same.
    expect(await response.text()).toBe("");
  }
});

test("the media route answers 404 for an empty stored file", async (context) => {
  const app = await createMediaApp(context);
  await app.saveMedia("images", "avatars/empty.jpg", "");

  const response = await app.request("/media/avatars/empty.jpg");

  expect(response.status).toBe(404);
});
