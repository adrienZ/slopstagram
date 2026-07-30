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
    const previewHash = getImageHash(previewSource);
    const { imageCacheStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    let fetchCount = 0;

    const cachedImages = await cacheReportImages(createReport(source, previewSource), {
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
});
