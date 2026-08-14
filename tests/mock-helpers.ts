import { Buffer } from "node:buffer";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { mock } from "node:test";
import path from "node:path";
import { createConsola } from "consola";
import { createCacheStorages } from "../sdk/lib/cache-service.ts";
import type { CachedReportImages } from "../sdk/lib/image-cache-service.ts";
import type { Logger } from "../sdk/lib/logging-service.ts";
import type {
  StoryItem,
  StoryReel,
  StoriesManifestReport,
  StoryTrayEntry,
} from "../sdk/lib/types.ts";
import type { InstagramClient, InstagramClientResponse } from "../sdk/stories.ts";
import { createMemoryStorage } from "./memory-storage.ts";

export const previewSource = "https://example.com/story-preview.webp";

function log(): void {}

log.raw = log;

export function createMockLogger(): Logger {
  const logger = createConsola();

  logger.mockTypes(() => log);

  return Object.assign(logger, {
    progress: () => {},
  });
}

export function createCapturingLogger(): Logger & { messages: string[] } {
  const messages: string[] = [];
  const logger = createConsola();

  logger.mockTypes((typeName) => {
    const capturingLog = (...args: unknown[]) => {
      messages.push(`${typeName}: ${args.join(" ")}`);
    };
    capturingLog.raw = capturingLog;

    return capturingLog;
  });

  function progress(value: number, total: number): void {
    messages.push(`progress: ${value}/${total}`);
  }

  return Object.assign(logger, {
    messages,
    progress,
  });
}

export function createMemoryCacheStorages(): ReturnType<typeof createCacheStorages> {
  return createCacheStorages(createMemoryStorage());
}

export function mockModule(specifier: string, namedExports: Record<string, unknown>): void {
  // Node 24 does not yet support the replacement `exports` option.
  // oxlint-disable-next-line typescript/no-deprecated
  void mock.module(specifier, { namedExports });
}

export function createVisionReport(source: string = previewSource): StoriesManifestReport {
  return createSingleStoryReport({
    appleCaption: "apple text",
    fullName: "Vision User",
    igCaption: "ig text",
    locations: [],
    previewImageUrl: source,
    stickers: [],
    username: "visionuser",
  });
}

export function createSummaryReport(): StoriesManifestReport {
  return createSingleStoryReport({
    appleCaption: "street food menu",
    fullName: "Summary User",
    igCaption: "Photo by Summary User on July 26, 2026. May be food.",
    locations: ["Paris Market, 10 Rue Food, Paris"],
    previewImageUrl: "https://example.com/story.jpg",
    stickers: ["location:Paris"],
    username: "summaryuser",
  });
}

export async function withReportImage<T>(
  run: (reportDirectory: string, cachedImages: CachedReportImages) => Promise<T>,
  storyPreviewPathByUrl: Map<string, string> = new Map([[previewSource, "story.jpg"]]),
): Promise<T> {
  const directory = await mkdtemp(path.join(tmpdir(), "slopstagram-vision-test-"));
  const imagePath = path.join(directory, "story.jpg");

  try {
    await writeFile(imagePath, Buffer.from("jpeg-bytes"));
    return await run(directory, {
      profilePicPathByUrl: new Map(),
      storyPreviewPathByUrl,
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

export function storyItem(pk: string, accessibilityCaption?: string | null): StoryItem {
  return {
    accessibility_caption: accessibilityCaption,
    image_versions2: {
      candidates: [
        {
          height: 100,
          url: `https://example.com/${pk}.jpg`,
          width: 100,
        },
      ],
    },
    media_type: 1,
    pk,
  };
}

export function storyItemWithStickers(
  pk: string,
  stickers: Partial<StoryItem>,
  accessibilityCaption?: string | null,
): StoryItem {
  return {
    ...storyItem(pk, accessibilityCaption),
    ...stickers,
  };
}

export function reel(id: string, items: StoryItem[]): StoryReel {
  return {
    id,
    items,
    media_ids: items.map((item) => item.pk),
  };
}

export function response<T>(
  value: T,
  status = 200,
  headers: Record<string, string> = {},
): InstagramClientResponse<T> {
  return {
    headers,
    json: () => Promise.resolve(value),
    ok: status >= 200 && status < 300,
    status,
  };
}

export function createClient(
  tray: StoryTrayEntry[],
  reelsResponses: Array<InstagramClientResponse<{ reels?: Record<string, StoryReel> }>>,
): InstagramClient & { reelsCalls: string[][] } {
  const reelsCalls: string[][] = [];

  return {
    reelsCalls,
    getTray() {
      return Promise.resolve(
        response({
          broadcasts: [],
          status: "ok",
          story_ranking_token: "ranking-token",
          tray,
        }),
      );
    },
    getReelsMedia(reelIds) {
      reelsCalls.push(reelIds);
      const nextResponse = reelsResponses.shift();

      if (nextResponse === undefined) {
        throw new Error("Unexpected reels media request");
      }

      return Promise.resolve(nextResponse);
    },
  };
}

export const fixedNow = () => new Date("2026-07-26T00:00:00.000Z");
export const noSleep = () => Promise.resolve();
export const resolveAppleCaption = (story: StoryItem) => Promise.resolve(`apple:${story.pk}`);

function createSingleStoryReport(options: {
  appleCaption: string;
  fullName: string;
  igCaption: string;
  locations: string[];
  previewImageUrl: string;
  stickers: string[];
  username: string;
}): StoriesManifestReport {
  return {
    failures: [],
    manifest: { users: [] },
    metadata: createReportMetadata(),
    output: {
      users: [createReportUser(options)],
    },
  };
}

function createReportMetadata(): StoriesManifestReport["metadata"] {
  return {
    broadcasts_count: 0,
    counts: {
      cache_hits: 0,
      cache_misses: 0,
      failed: 0,
      fetched: 0,
      reels: 0,
      stories: 1,
    },
    created_at: "2026-07-26T09:48:26.773Z",
    report_name: "stories-report.json",
    status: "ok",
    story_ranking_token: null,
  };
}

function createReportUser(
  options: Parameters<typeof createSingleStoryReport>[0],
): StoriesManifestReport["output"]["users"][number] {
  return {
    full_name: options.fullName,
    profile_pic_url: null,
    reel_ids: ["r1"],
    stories: [
      {
        apple_caption: options.appleCaption,
        ig_caption: options.igCaption,
        locations: options.locations,
        media_pk: "story-pk",
        preview_image_url: options.previewImageUrl,
        stickers: options.stickers,
        status: "ok",
      },
    ],
    username: options.username,
  };
}
