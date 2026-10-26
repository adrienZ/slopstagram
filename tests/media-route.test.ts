import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vitest";
import { createMediaResponse, resolveMediaPath } from "../server/routes/media/[...path].ts";

test("createMediaResponse serves cached JPEG images", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "slopstagram-media-test-"));
  const imageDirectory = path.join(root, "story-previews");

  try {
    await mkdir(imageDirectory);
    await writeFile(path.join(imageDirectory, "story-1.jpg"), "jpeg-bytes");

    const response = await createMediaResponse("story-previews/story-1.jpg", root);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(await response.text(), "jpeg-bytes");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("media paths reject traversal and non-JPEG files", () => {
  const root = path.resolve("/cache/images");

  assert.equal(resolveMediaPath("../secret.jpg", root), null);
  assert.equal(resolveMediaPath("%2e%2e/secret.jpg", root), null);
  assert.equal(resolveMediaPath("story-previews/story-1.png", root), null);
  assert.equal(
    resolveMediaPath("story-previews/story-1.jpg", root),
    path.join(root, "story-previews", "story-1.jpg"),
  );
});

test("cached audio supports content types, seek ranges, HEAD, and missing or unsatisfiable files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "slopstagram-audio-test-"));
  try {
    await mkdir(path.join(root, "music"));
    await writeFile(path.join(root, "music", "recording.m4a"), "0123456789");
    const response = await createMediaResponse("music/recording.m4a", root, { range: "bytes=3-6" });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-type"), "audio/mp4");
    assert.equal(response.headers.get("content-range"), "bytes 3-6/10");
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(await response.text(), "3456");
    const suffix = await createMediaResponse("music/recording.m4a", root, { range: "bytes=-2" });
    assert.equal(await suffix.text(), "89");
    const tail = await createMediaResponse("music/recording.m4a", root, { range: "bytes=7-" });
    assert.equal(await tail.text(), "789");
    const invalid = await createMediaResponse("music/recording.m4a", root, { range: "bytes=10-" });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get("content-range"), "bytes */10");
    const head = await createMediaResponse("music/recording.m4a", root, { method: "HEAD" });
    assert.equal(head.headers.get("content-length"), "10");
    assert.equal(await head.text(), "");
    const missing = await createMediaResponse("music/missing.mp3", root);
    assert.equal(missing.status, 404);
    assert.equal(resolveMediaPath("avatars/audio.mp3", root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
