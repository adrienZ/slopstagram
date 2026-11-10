import { Buffer } from "node:buffer";
import { describe, test, expect } from "vitest";
import sharp from "sharp";
import { readBytes } from "@@/core/domains/media-store/cache-storage.ts";
import { cacheReportImages } from "@@/core/domains/media-store/image-cache.ts";
import type { StoriesManifestReport } from "@@/core/domains/fetch-run/report-types.ts";
import { createMemoryCacheStorage } from "./memory-storage.ts";
import { createCapturingLogger, createMockLogger } from "./mock-helpers.ts";

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

type Images = ReturnType<typeof createMemoryCacheStorage>["images"];

/** A real PNG of the given width: the pipeline converts what it fetches with sharp, unfaked. */
async function pngOfWidth(width: number): Promise<Buffer> {
  return await sharp({
    create: { background: { r: 255, g: 0, b: 0 }, channels: 3, height: 2, width },
  })
    .png()
    .toBuffer();
}

function imageResponse(body: Uint8Array) {
  return {
    arrayBuffer: async () => await Promise.resolve(new Uint8Array(body).buffer),
    headers: { get: () => "image/png" },
    ok: true,
    status: 200,
  };
}

/** The format and width of the image stored at a key. */
async function storedImage(images: Images, key: string) {
  const bytes = await readBytes(images, key);
  expect(bytes).not.toBeNull();
  const { format, width } = await sharp(bytes ?? Buffer.alloc(0)).metadata();
  return { format, width };
}

describe("cacheReportImages", () => {
  test("caches profile pictures as local report-relative files, converted to JPEG", async () => {
    const source = "https://example.com/avatar?id=1";
    const previewSource = "https://example.com/story-preview.webp";
    const previewKey = "story-pk";
    const storage = createMemoryCacheStorage();
    const png = await pngOfWidth(4);
    let fetchCount = 0;

    const report = createReport(source, previewSource);
    const cachedImages = await cacheReportImages(
      {
        fetchImage: async () => {
          fetchCount += 1;
          return imageResponse(png);
        },
        logger: createMockLogger(),
        storage,
      },
      report,
    );

    expect(fetchCount).toBe(2);
    expect(cachedImages.profilePicPathByUrl.get(source)).toBe(`images/avatars/${PROFILE_PK}.jpg`);
    expect(cachedImages.storyPreviewPathByUrl.get(previewSource)).toBe(
      `images/story-previews/${previewKey}.jpg`,
    );
    expect(report.output.users[0]?.profile_pic_url).toBe(`images/avatars/${PROFILE_PK}.jpg`);
    expect(report.output.users[0]?.stories[0]?.preview_image_url).toBe(
      `images/story-previews/${previewKey}.jpg`,
    );
    expect(await storedImage(storage.images, `avatars/${PROFILE_PK}.jpg`)).toStrictEqual({
      format: "jpeg",
      width: 4,
    });
    expect(await storedImage(storage.images, `story-previews/${previewKey}.jpg`)).toStrictEqual({
      format: "jpeg",
      width: 4,
    });
    expect(await storage.images.getItemRaw(`avatars/${PROFILE_PK}.json`)).toBe(null);
    expect(await storage.images.getItemRaw(`story-previews/${previewKey}.json`)).toBe(null);
  });

  test("refreshes cached profile pictures from the latest API response", async () => {
    const source = "https://example.com/avatar.webp";
    const storage = createMemoryCacheStorage();
    await storage.images.setItemRaw(`avatars/${PROFILE_PK}.jpg`, Buffer.from("jpeg-avatar"));
    const updated = await pngOfWidth(6);

    const cachedImages = await cacheReportImages(
      { fetchImage: async () => imageResponse(updated), logger: createMockLogger(), storage },
      createReport(source),
    );

    expect(cachedImages.profilePicPathByUrl.get(source)).toBe(`images/avatars/${PROFILE_PK}.jpg`);
    expect(await storedImage(storage.images, `avatars/${PROFILE_PK}.jpg`)).toStrictEqual({
      format: "jpeg",
      width: 6,
    });
  });

  test("reuses cached story previews without fetching again", async () => {
    const source = "https://example.com/avatar.jpg";
    const previewSource = "https://example.com/story-preview.webp";
    const previewKey = "story-pk";
    const storage = createMemoryCacheStorage();
    const imageCacheStorage = storage.images;
    await imageCacheStorage.setItemRaw(`avatars/${PROFILE_PK}.jpg`, Buffer.from("jpeg-avatar"));
    await imageCacheStorage.setItemRaw(
      `story-previews/${previewKey}.jpg`,
      Buffer.from("jpeg-story"),
    );

    const cachedImages = await cacheReportImages(
      {
        fetchImage: async () => {
          throw new Error("should not fetch");
        },
        logger: createMockLogger(),
        storage,
      },
      createReport(source, previewSource),
    );

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
    const storage = createMemoryCacheStorage();
    const png = await pngOfWidth(4);
    let fetchCount = 0;

    const runtime = {
      fetchImage: async () => {
        fetchCount += 1;
        return imageResponse(png);
      },
      logger: createMockLogger(),
      storage,
    };

    const first = await cacheReportImages(runtime, createReport(source, firstPreviewSource));
    const second = await cacheReportImages(runtime, createReport(source, secondPreviewSource));

    expect(fetchCount).toBe(3);
    expect(first.storyPreviewPathByUrl.get(firstPreviewSource)).toBe(
      `images/story-previews/${previewKey}.jpg`,
    );
    expect(second.storyPreviewPathByUrl.get(secondPreviewSource)).toBe(
      `images/story-previews/${previewKey}.jpg`,
    );
    expect(await storedImage(storage.images, `story-previews/${previewKey}.jpg`)).toStrictEqual({
      format: "jpeg",
      width: 4,
    });
  });

  test("keeps nothing and logs a warning when the fetched bytes are not an image", async () => {
    const source = "https://example.com/avatar.webp";
    const storage = createMemoryCacheStorage();
    const logger = createCapturingLogger();

    const cachedImages = await cacheReportImages(
      {
        fetchImage: async () => imageResponse(Buffer.from("not an image")),
        logger,
        storage,
      },
      createReport(source),
    );

    expect(cachedImages.profilePicPathByUrl.size).toBe(0);
    expect(await storage.images.getItemRaw(`avatars/${PROFILE_PK}.jpg`)).toBe(null);
    expect(logger.messages.some((message) => message.includes("to JPEG"))).toBe(true);
  });
});
