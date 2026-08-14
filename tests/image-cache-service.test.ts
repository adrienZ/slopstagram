import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { TextEncoder } from "node:util";
import {
  BASE_CACHE_DIR,
  createCacheStorages,
  REPORTS_STORAGE_DIR,
} from "../sdk/lib/cache-service.ts";
import { cacheReportImages } from "../sdk/lib/image-cache-service.ts";
import type { StoriesManifestReport } from "../sdk/lib/types.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import { createMockLogger } from "./mock-helpers.ts";

const PROFILE_PK = "avatar-pk";

function createReport(
  profilePicUrl: string,
  storyPreviewUrl: string | null = null,
): StoriesManifestReport {
  return {
    failures: [],
    manifest: {
      users: [
        {
          full_name: "Avatar User",
          id: "avatar-id",
          media_ids: [],
          order: 0,
          pk: PROFILE_PK,
          profile_pic_url: profilePicUrl,
          reel_id: "r1",
          stories: [],
          username: "avataruser",
        },
      ],
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
              ig_caption: "ig text",
              locations: [],
              media_pk: "story-pk",
              preview_image_url: storyPreviewUrl,
              stickers: [],
              status: "ok",
            },
          ],
          username: "avataruser",
        },
      ],
    },
  };
}

describe("cacheReportImages", () => {
  test("caches profile pictures as local report-relative files", async () => {
    const source = "https://example.com/avatar?id=1";
    const previewSource = "https://example.com/story-preview.webp";
    const previewKey = "story-pk";
    const { imageCacheStorage } = createCacheStorages(createMemoryStorage());
    let fetchCount = 0;
    let convertCount = 0;

    const report = createReport(source, previewSource);
    const cachedImages = await cacheReportImages(report, {
      convertToJpeg: (body) => {
        convertCount += 1;
        return Promise.resolve(Buffer.from(`jpeg:${body.toString()}`));
      },
      fetchImage: () => {
        fetchCount += 1;
        const body = new TextEncoder().encode("image-bytes");
        return Promise.resolve({
          arrayBuffer: () =>
            Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)),
          headers: {
            get: (name) => (name.toLowerCase() === "content-type" ? "image/jpeg" : null),
          },
          ok: true,
          status: 200,
        });
      },
      logger: createMockLogger(),
      reportDirectory: path.resolve(BASE_CACHE_DIR, REPORTS_STORAGE_DIR),
      storage: imageCacheStorage,
    });

    assert.equal(fetchCount, 2);
    assert.equal(convertCount, 2);
    assert.equal(
      cachedImages.profilePicPathByUrl.get(source),
      `../images/avatars/${PROFILE_PK}.jpg`,
    );
    assert.equal(
      cachedImages.storyPreviewPathByUrl.get(previewSource),
      `../images/story-previews/${previewKey}.jpg`,
    );
    assert.equal(report.output.users[0]?.profile_pic_url, `../images/avatars/${PROFILE_PK}.jpg`);
    assert.equal(
      report.output.users[0]?.stories[0]?.preview_image_url,
      `../images/story-previews/${previewKey}.jpg`,
    );
    assert.deepEqual(
      await imageCacheStorage.getItemRaw(`avatars/${PROFILE_PK}.jpg`),
      Buffer.from("jpeg:image-bytes"),
    );
    assert.deepEqual(
      await imageCacheStorage.getItemRaw(`story-previews/${previewKey}.jpg`),
      Buffer.from("jpeg:image-bytes"),
    );
    assert.equal(await imageCacheStorage.getItemRaw(`avatars/${PROFILE_PK}.json`), null);
    assert.equal(await imageCacheStorage.getItemRaw(`story-previews/${previewKey}.json`), null);
  });

  test("refreshes cached profile pictures from the latest API response", async () => {
    const source = "https://example.com/avatar.webp";
    const { imageCacheStorage } = createCacheStorages(createMemoryStorage());
    await imageCacheStorage.setItemRaw(`avatars/${PROFILE_PK}.jpg`, Buffer.from("jpeg-avatar"));

    const cachedImages = await cacheReportImages(createReport(source), {
      convertToJpeg: (body) => Promise.resolve(Buffer.from(`jpeg:${body.toString()}`)),
      fetchImage: () => {
        const body = new TextEncoder().encode("updated-avatar");
        return Promise.resolve({
          arrayBuffer: () =>
            Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)),
          headers: { get: () => "image/jpeg" },
          ok: true,
          status: 200,
        });
      },
      logger: createMockLogger(),
      reportDirectory: path.resolve(BASE_CACHE_DIR, REPORTS_STORAGE_DIR),
      storage: imageCacheStorage,
    });

    assert.equal(
      cachedImages.profilePicPathByUrl.get(source),
      `../images/avatars/${PROFILE_PK}.jpg`,
    );
    assert.deepEqual(
      await imageCacheStorage.getItemRaw(`avatars/${PROFILE_PK}.jpg`),
      Buffer.from("jpeg:updated-avatar"),
    );
  });

  test("reuses cached story previews without fetching again", async () => {
    const source = "https://example.com/avatar.jpg";
    const previewSource = "https://example.com/story-preview.webp";
    const previewKey = "story-pk";
    const { imageCacheStorage } = createCacheStorages(createMemoryStorage());
    await imageCacheStorage.setItemRaw(`avatars/${PROFILE_PK}.jpg`, Buffer.from("jpeg-avatar"));
    await imageCacheStorage.setItemRaw(
      `story-previews/${previewKey}.jpg`,
      Buffer.from("jpeg-story"),
    );

    const cachedImages = await cacheReportImages(createReport(source, previewSource), {
      fetchImage: () => Promise.reject(new Error("should not fetch")),
      logger: createMockLogger(),
      reportDirectory: path.resolve(BASE_CACHE_DIR, REPORTS_STORAGE_DIR),
      storage: imageCacheStorage,
    });

    assert.equal(
      cachedImages.storyPreviewPathByUrl.get(previewSource),
      `../images/story-previews/${previewKey}.jpg`,
    );
    assert.deepEqual(
      await imageCacheStorage.getItemRaw(`story-previews/${previewKey}.jpg`),
      Buffer.from("jpeg-story"),
    );
  });

  test("reuses story preview cache when the signed CDN URL changes", async () => {
    const source = "https://example.com/avatar.jpg";
    const firstPreviewSource = "https://example.com/story-preview.webp?signature=old";
    const secondPreviewSource = "https://example.com/story-preview.webp?signature=new";
    const previewKey = "story-pk";
    const { imageCacheStorage } = createCacheStorages(createMemoryStorage());
    let fetchCount = 0;

    const options = {
      convertToJpeg: (body: Buffer) => Promise.resolve(Buffer.from(`jpeg:${body.toString()}`)),
      fetchImage: (url: string) => {
        fetchCount += 1;
        const body = new TextEncoder().encode(url.includes("avatar") ? "avatar" : "story");
        return Promise.resolve({
          arrayBuffer: () =>
            Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)),
          headers: {
            get: (name: string) => (name.toLowerCase() === "content-type" ? "image/webp" : null),
          },
          ok: true,
          status: 200,
        });
      },
      logger: createMockLogger(),
      reportDirectory: path.resolve(BASE_CACHE_DIR, REPORTS_STORAGE_DIR),
      storage: imageCacheStorage,
    };

    const first = await cacheReportImages(createReport(source, firstPreviewSource), options);
    const second = await cacheReportImages(createReport(source, secondPreviewSource), options);

    assert.equal(fetchCount, 3);
    assert.equal(
      first.storyPreviewPathByUrl.get(firstPreviewSource),
      `../images/story-previews/${previewKey}.jpg`,
    );
    assert.equal(
      second.storyPreviewPathByUrl.get(secondPreviewSource),
      `../images/story-previews/${previewKey}.jpg`,
    );
    assert.deepEqual(
      await imageCacheStorage.getItemRaw(`story-previews/${previewKey}.jpg`),
      Buffer.from("jpeg:story"),
    );
  });
});
