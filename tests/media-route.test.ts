import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
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
