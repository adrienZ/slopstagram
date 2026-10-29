import { Buffer } from "node:buffer";
import { describe, test, expect } from "vitest";
import { TextEncoder } from "node:util";
import { BASE_CACHE_DIR, createImageCacheStorage } from "../sdk/lib/cache-service.ts";
import { cacheReportImages } from "../sdk/lib/image-cache-service.ts";
import type { StoriesManifestReport } from "../sdk/report-types.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import { createMockLogger } from "./mock-helpers.ts";

const PROFILE_PK = "avatar-pk";
const cacheDirectory = BASE_CACHE_DIR;

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
    const imageCacheStorage = createImageCacheStorage(createMemoryStorage());
    let fetchCount = 0;
    let convertCount = 0;

    const report = createReport(source, previewSource);
    const cachedImages = await cacheReportImages(report, {
      convertToJpeg: async (body) => {
        convertCount += 1;
        return Buffer.from(`jpeg:${body.toString()}`);
      },
      fetchImage: async () => {
        fetchCount += 1;
        const body = new TextEncoder().encode("image-bytes");
        return {
          arrayBuffer: async () =>
            await Promise.resolve(
              body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
            ),
          headers: {
            get: (name) => (name.toLowerCase() === "content-type" ? "image/jpeg" : null),
          },
          ok: true,
          status: 200,
        };
      },
      logger: createMockLogger(),
      cacheDirectory,
      storage: imageCacheStorage,
    });

    expect(fetchCount).toBe(2);
    expect(convertCount).toBe(2);
    expect(cachedImages.profilePicPathByUrl.get(source)).toBe(`images/avatars/${PROFILE_PK}.jpg`);
    expect(cachedImages.storyPreviewPathByUrl.get(previewSource)).toBe(
      `images/story-previews/${previewKey}.jpg`,
    );
    expect(report.output.users[0]?.profile_pic_url).toBe(`images/avatars/${PROFILE_PK}.jpg`);
    expect(report.output.users[0]?.stories[0]?.preview_image_url).toBe(
      `images/story-previews/${previewKey}.jpg`,
    );
    expect(await imageCacheStorage.getItemRaw(`avatars/${PROFILE_PK}.jpg`)).toStrictEqual(
      Buffer.from("jpeg:image-bytes"),
    );
    expect(await imageCacheStorage.getItemRaw(`story-previews/${previewKey}.jpg`)).toStrictEqual(
      Buffer.from("jpeg:image-bytes"),
    );
    expect(await imageCacheStorage.getItemRaw(`avatars/${PROFILE_PK}.json`)).toBe(null);
    expect(await imageCacheStorage.getItemRaw(`story-previews/${previewKey}.json`)).toBe(null);
  });

  test("refreshes cached profile pictures from the latest API response", async () => {
    const source = "https://example.com/avatar.webp";
    const imageCacheStorage = createImageCacheStorage(createMemoryStorage());
    await imageCacheStorage.setItemRaw(`avatars/${PROFILE_PK}.jpg`, Buffer.from("jpeg-avatar"));

    const cachedImages = await cacheReportImages(createReport(source), {
      convertToJpeg: async (body) => Buffer.from(`jpeg:${body.toString()}`),
      fetchImage: async () => {
        const body = new TextEncoder().encode("updated-avatar");
        return {
          arrayBuffer: async () =>
            await Promise.resolve(
              body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
            ),
          headers: { get: () => "image/jpeg" },
          ok: true,
          status: 200,
        };
      },
      logger: createMockLogger(),
      cacheDirectory,
      storage: imageCacheStorage,
    });

    expect(cachedImages.profilePicPathByUrl.get(source)).toBe(`images/avatars/${PROFILE_PK}.jpg`);
    expect(await imageCacheStorage.getItemRaw(`avatars/${PROFILE_PK}.jpg`)).toStrictEqual(
      Buffer.from("jpeg:updated-avatar"),
    );
  });

  test("reuses cached story previews without fetching again", async () => {
    const source = "https://example.com/avatar.jpg";
    const previewSource = "https://example.com/story-preview.webp";
    const previewKey = "story-pk";
    const imageCacheStorage = createImageCacheStorage(createMemoryStorage());
    await imageCacheStorage.setItemRaw(`avatars/${PROFILE_PK}.jpg`, Buffer.from("jpeg-avatar"));
    await imageCacheStorage.setItemRaw(
      `story-previews/${previewKey}.jpg`,
      Buffer.from("jpeg-story"),
    );

    const cachedImages = await cacheReportImages(createReport(source, previewSource), {
      fetchImage: async () => {
        throw new Error("should not fetch");
      },
      logger: createMockLogger(),
      cacheDirectory,
      storage: imageCacheStorage,
    });

    expect(cachedImages.storyPreviewPathByUrl.get(previewSource)).toBe(
      `images/story-previews/${previewKey}.jpg`,
    );
    expect(await imageCacheStorage.getItemRaw(`story-previews/${previewKey}.jpg`)).toStrictEqual(
      Buffer.from("jpeg-story"),
    );
  });

  test("reuses story preview cache when the signed CDN URL changes", async () => {
    const source = "https://example.com/avatar.jpg";
    const firstPreviewSource = "https://example.com/story-preview.webp?signature=old";
    const secondPreviewSource = "https://example.com/story-preview.webp?signature=new";
    const previewKey = "story-pk";
    const imageCacheStorage = createImageCacheStorage(createMemoryStorage());
    let fetchCount = 0;

    const options = {
      convertToJpeg: async (body: Buffer) => Buffer.from(`jpeg:${body.toString()}`),
      fetchImage: async (url: string) => {
        fetchCount += 1;
        const body = new TextEncoder().encode(url.includes("avatar") ? "avatar" : "story");
        return {
          arrayBuffer: async () =>
            await Promise.resolve(
              body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
            ),
          headers: {
            get: (name: string) => (name.toLowerCase() === "content-type" ? "image/webp" : null),
          },
          ok: true,
          status: 200,
        };
      },
      logger: createMockLogger(),
      cacheDirectory,
      storage: imageCacheStorage,
    };

    const first = await cacheReportImages(createReport(source, firstPreviewSource), options);
    const second = await cacheReportImages(createReport(source, secondPreviewSource), options);

    expect(fetchCount).toBe(3);
    expect(first.storyPreviewPathByUrl.get(firstPreviewSource)).toBe(
      `images/story-previews/${previewKey}.jpg`,
    );
    expect(second.storyPreviewPathByUrl.get(secondPreviewSource)).toBe(
      `images/story-previews/${previewKey}.jpg`,
    );
    expect(await imageCacheStorage.getItemRaw(`story-previews/${previewKey}.jpg`)).toStrictEqual(
      Buffer.from("jpeg:story"),
    );
  });
});
