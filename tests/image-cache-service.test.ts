import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, test } from "node:test";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import {
  createCacheStorages,
  getImageCacheMetadataKey,
} from "../scripts/lib/cache-service.ts";
import { cacheReportImages } from "../scripts/lib/image-cache-service.ts";
import type { StoriesManifestReport } from "../scripts/lib/types.ts";

function createReport(
  profilePicUrl: string,
  storyPreviewUrl: string | null = null,
): StoriesManifestReport {
  return {
    failures: [],
    manifest: {
      users: [],
    },
    metadata: {
      broadcasts_count: 0,
      counts: {
        cache_hits: 0,
        cache_misses: 0,
        failed: 0,
        fetched: 0,
        reels: 0,
        stories: 0,
      },
      created_at: "2026-07-26T09:48:26.773Z",
      report_name: "stories-report.json",
      status: "ok",
      story_ranking_token: null,
    },
    output: {
      users: [
        {
          full_name: "Avatar User",
          profile_pic_url: profilePicUrl,
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "apple text",
              ig_caption: "ig text",
              media_pk: "story-pk",
              preview_image_url: storyPreviewUrl,
              stickers: [],
              status: "cached",
            },
          ],
          username: "avataruser",
        },
      ],
    },
  };
}

function getImageHash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

describe("cacheReportImages", () => {
  test("caches profile pictures as local report-relative files", async () => {
    const source = "https://example.com/avatar?id=1";
    const previewSource = "https://example.com/story-preview.webp";
    const imageHash = getImageHash(source);
    const previewHash = getImageHash("story-pk");
    const { imageCacheStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    let fetchCount = 0;
    let convertCount = 0;

    const cachedImages = await cacheReportImages(createReport(source, previewSource), {
      convertToJpeg: async (body) => {
        convertCount += 1;
        return Buffer.from(`jpeg:${body.toString()}`);
      },
      fetchImage: async () => {
        fetchCount += 1;
        const body = new TextEncoder().encode("image-bytes");
        return {
          arrayBuffer: async () =>
            body.buffer.slice(
              body.byteOffset,
              body.byteOffset + body.byteLength,
            ) as ArrayBuffer,
          headers: {
            get: (name) => (name.toLowerCase() === "content-type" ? "image/jpeg" : null),
          },
          ok: true,
          status: 200,
        };
      },
      reportDirectory: path.resolve(".tmp/reports"),
      storage: imageCacheStorage,
    });

    assert.equal(fetchCount, 2);
    assert.equal(convertCount, 1);
    assert.equal(
      cachedImages.profilePicPathByUrl.get(source),
      `../images/avatars/${imageHash}.jpg`,
    );
    assert.equal(
      cachedImages.storyPreviewPathByUrl.get(previewSource),
      `../images/story-previews/${previewHash}.jpg`,
    );
    assert.deepEqual(
      await imageCacheStorage.getItem(getImageCacheMetadataKey(`avatars/${imageHash}`)),
      {
        content_type: "image/jpeg",
        path: `images/avatars/${imageHash}.jpg`,
        source,
      },
    );
    assert.deepEqual(
      await imageCacheStorage.getItemRaw(`avatars/${imageHash}.jpg`),
      Buffer.from("image-bytes"),
    );
    assert.deepEqual(
      await imageCacheStorage.getItemRaw(`story-previews/${previewHash}.jpg`),
      Buffer.from("jpeg:image-bytes"),
    );
    assert.deepEqual(
      await imageCacheStorage.getItem(
        getImageCacheMetadataKey(`story-previews/${previewHash}`),
      ),
      {
        content_type: "image/jpeg",
        path: `images/story-previews/${previewHash}.jpg`,
        source: previewSource,
      },
    );
  });

  test("reuses cached profile pictures without fetching again", async () => {
    const source = "https://example.com/avatar.webp";
    const imageHash = getImageHash(source);
    const { imageCacheStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    await imageCacheStorage.setItem(getImageCacheMetadataKey(`avatars/${imageHash}`), {
      content_type: "image/webp",
      path: `images/avatars/${imageHash}.webp`,
      source,
    });

    const cachedImages = await cacheReportImages(createReport(source), {
      fetchImage: async () => {
        throw new Error("should not fetch");
      },
      reportDirectory: path.resolve(".tmp/reports"),
      storage: imageCacheStorage,
    });

    assert.equal(
      cachedImages.profilePicPathByUrl.get(source),
      `../images/avatars/${imageHash}.webp`,
    );
  });

  test("converts cached webp story previews to jpeg on reuse", async () => {
    const source = "https://example.com/avatar.jpg";
    const previewSource = "https://example.com/story-preview.webp";
    const previewHash = getImageHash("story-pk");
    const { imageCacheStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    await imageCacheStorage.setItem(
      getImageCacheMetadataKey(`story-previews/${previewHash}`),
      {
        content_type: "image/webp",
        path: `images/story-previews/${previewHash}.webp`,
        source: previewSource,
      },
    );
    await imageCacheStorage.setItemRaw(
      `story-previews/${previewHash}.webp`,
      Buffer.from("webp-bytes"),
    );

    const cachedImages = await cacheReportImages(createReport(source, previewSource), {
      convertToJpeg: async (body) => Buffer.from(`jpeg:${body.toString()}`),
      fetchImage: async () => {
        const body = new TextEncoder().encode("avatar-bytes");
        return {
          arrayBuffer: async () =>
            body.buffer.slice(
              body.byteOffset,
              body.byteOffset + body.byteLength,
            ) as ArrayBuffer,
          headers: {
            get: (name) => (name.toLowerCase() === "content-type" ? "image/jpeg" : null),
          },
          ok: true,
          status: 200,
        };
      },
      reportDirectory: path.resolve(".tmp/reports"),
      storage: imageCacheStorage,
    });

    assert.equal(
      cachedImages.storyPreviewPathByUrl.get(previewSource),
      `../images/story-previews/${previewHash}.jpg`,
    );
    assert.deepEqual(
      await imageCacheStorage.getItemRaw(`story-previews/${previewHash}.jpg`),
      Buffer.from("jpeg:webp-bytes"),
    );
    assert.deepEqual(
      await imageCacheStorage.getItem(
        getImageCacheMetadataKey(`story-previews/${previewHash}`),
      ),
      {
        content_type: "image/jpeg",
        path: `images/story-previews/${previewHash}.jpg`,
        source: previewSource,
      },
    );
  });

  test("reuses story preview cache when the signed CDN URL changes", async () => {
    const source = "https://example.com/avatar.jpg";
    const firstPreviewSource = "https://example.com/story-preview.webp?signature=old";
    const secondPreviewSource = "https://example.com/story-preview.webp?signature=new";
    const previewHash = getImageHash("story-pk");
    const { imageCacheStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    let fetchCount = 0;

    const options = {
      convertToJpeg: async (body: Buffer) => Buffer.from(`jpeg:${body.toString()}`),
      fetchImage: async (url: string) => {
        fetchCount += 1;
        const body = new TextEncoder().encode(url.includes("avatar") ? "avatar" : "story");
        return {
          arrayBuffer: async () =>
            body.buffer.slice(
              body.byteOffset,
              body.byteOffset + body.byteLength,
            ) as ArrayBuffer,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "content-type" ? "image/webp" : null,
          },
          ok: true,
          status: 200,
        };
      },
      reportDirectory: path.resolve(".tmp/reports"),
      storage: imageCacheStorage,
    };

    const first = await cacheReportImages(createReport(source, firstPreviewSource), options);
    const second = await cacheReportImages(createReport(source, secondPreviewSource), options);

    assert.equal(fetchCount, 2);
    assert.equal(
      first.storyPreviewPathByUrl.get(firstPreviewSource),
      `../images/story-previews/${previewHash}.jpg`,
    );
    assert.equal(
      second.storyPreviewPathByUrl.get(secondPreviewSource),
      `../images/story-previews/${previewHash}.jpg`,
    );
    assert.deepEqual(
      await imageCacheStorage.getItemRaw(`story-previews/${previewHash}.jpg`),
      Buffer.from("jpeg:story"),
    );
  });
});
