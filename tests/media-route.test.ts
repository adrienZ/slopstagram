import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect } from "vitest";
import { createMediaResponse, resolveMediaPath } from "../server/routes/media/[...path].ts";

test("createMediaResponse serves cached JPEG images", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "slopstagram-media-test-"));
  const imageDirectory = path.join(root, "story-previews");

  try {
    await mkdir(imageDirectory);
    await writeFile(path.join(imageDirectory, "story-1.jpg"), "jpeg-bytes");

    const response = await createMediaResponse("story-previews/story-1.jpg", root);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(await response.text()).toBe("jpeg-bytes");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("media paths reject traversal and non-JPEG files", () => {
  const root = path.resolve("/cache/images");

  expect(resolveMediaPath("../secret.jpg", root)).toBe(null);
  expect(resolveMediaPath("%2e%2e/secret.jpg", root)).toBe(null);
  expect(resolveMediaPath("story-previews/story-1.png", root)).toBe(null);
  expect(resolveMediaPath("story-previews/story-1.jpg", root)).toBe(
    path.join(root, "story-previews", "story-1.jpg"),
  );
});

test("cached audio supports content types, seek ranges, HEAD, and missing or unsatisfiable files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "slopstagram-audio-test-"));
  try {
    await mkdir(path.join(root, "audio"));
    await writeFile(path.join(root, "audio", "recording.m4a"), "0123456789");
    const response = await createMediaResponse("audio/recording.m4a", root, { range: "bytes=3-6" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("audio/mp4");
    expect(response.headers.get("content-range")).toBe("bytes 3-6/10");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(await response.text()).toBe("3456");
    const suffix = await createMediaResponse("audio/recording.m4a", root, { range: "bytes=-2" });
    expect(await suffix.text()).toBe("89");
    const tail = await createMediaResponse("audio/recording.m4a", root, { range: "bytes=7-" });
    expect(await tail.text()).toBe("789");
    const invalid = await createMediaResponse("audio/recording.m4a", root, { range: "bytes=10-" });
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("content-range")).toBe("bytes */10");
    const head = await createMediaResponse("audio/recording.m4a", root, { method: "HEAD" });
    expect(head.headers.get("content-length")).toBe("10");
    expect(await head.text()).toBe("");
    const missing = await createMediaResponse("audio/missing.mp3", root);
    expect(missing.status).toBe(404);
    expect(resolveMediaPath("avatars/audio.mp3", root)).toBe(null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
