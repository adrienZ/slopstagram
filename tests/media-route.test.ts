import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { type TestContext, assert, expect, test, vi } from "vitest";

function noNextHandler(): never {
  throw new Error("The media route answers every request itself.");
}

/**
 * The application router of an app whose working directory is a fresh temporary folder, so the
 * media route serves that folder's `data/cache` instead of the real media store.
 */
async function createMediaApp(context: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), "slopstagram-media-test-"));
  context.onTestFinished(async () => {
    vi.restoreAllMocks();
    await rm(root, { force: true, recursive: true });
  });
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.resetModules();
  const { getRouter } = await import("../app/router.tsx");
  const { Route: mediaRoute } = await import("../app/routes/media/$.ts");
  const router = getRouter();

  return {
    async saveMedia(cachePath: string, contents: string) {
      const file = path.join(root, "data", "cache", cachePath);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, contents);
    },
    /** Answers a request like TanStack Start does for a server route: HEAD falls back to GET. */
    async request(url: string, init?: RequestInit): Promise<Response> {
      const request = new globalThis.Request(`http://localhost${url}`, init);
      const [, params, route] = router.getMatchedRoutes(url);
      expect(route).toBe(mediaRoute);
      const handlers = mediaRoute.options.server?.handlers;
      assert.ok(handlers !== undefined && "GET" in handlers);
      const handler = handlers.GET;
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- A method handler is a function or a builder object; the media route defines a function.
      assert.ok(typeof handler === "function");
      const response = await handler({
        request,
        params: { _splat: params._splat },
        pathname: "/media/$",
        context: undefined,
        next: noNextHandler,
      });
      assert.ok(response instanceof globalThis.Response);
      return response;
    },
  };
}

function range(value: string): RequestInit {
  return { headers: { range: value } };
}

test("the media route serves cached JPEG images", async (context) => {
  const app = await createMediaApp(context);
  await app.saveMedia("images/story-previews/story-1.jpg", "jpeg-bytes");

  const response = await app.request("/media/story-previews/story-1.jpg");

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await response.text()).toBe("jpeg-bytes");
});

test("the media route rejects traversal, non-JPEG images and audio outside the audio folder", async (context) => {
  const app = await createMediaApp(context);
  await app.saveMedia("secret.jpg", "secret");
  await app.saveMedia("images/story-previews/story-1.png", "png-bytes");
  await app.saveMedia("images/avatars/audio.mp3", "mp3-bytes");

  const urls = [
    "/media/..%2fsecret.jpg",
    "/media/avatars/..%2f..%2fsecret.jpg",
    "/media/story-previews/story-1.png",
    "/media/avatars/audio.mp3",
    "/media/avatars/missing.jpg",
  ];
  const responses = await Promise.all(urls.map(async (url) => await app.request(url)));

  expect(responses.map((response) => response.status)).toStrictEqual(urls.map(() => 404));
});

test("the media route serves cached audio with seek ranges, HEAD, and missing or unsatisfiable files", async (context) => {
  const app = await createMediaApp(context);
  await app.saveMedia("audio/recording.m4a", "0123456789");

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
