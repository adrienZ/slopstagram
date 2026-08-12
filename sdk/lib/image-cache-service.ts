import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import path from "node:path";
import { BASE_CACHE_DIR, IMAGES_STORAGE_DIR, imageCacheStorage } from "./cache-service.ts";
import { convertImageToJpeg } from "./image-conversion-service.ts";
import type { Logger } from "./logging-service.ts";
import type { ImageCacheStorage, StoriesManifestReport } from "./types.ts";

type FetchResponse = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  headers: {
    get: (name: string) => string | null;
  };
  ok: boolean;
  status: number;
};

type FetchImage = (url: string) => Promise<FetchResponse>;

export type CacheReportImagesOptions = {
  convertToJpeg?: typeof convertImageToJpeg;
  fetchImage?: FetchImage;
  logger: Logger;
  reportDirectory?: string;
  storage?: ImageCacheStorage;
};

export type CachedReportImages = {
  profilePicPathByUrl: Map<string, string>;
  storyPreviewPathByUrl: Map<string, string>;
};

type ResolvedCacheReportImagesOptions = Required<
  Pick<
    CacheReportImagesOptions,
    "convertToJpeg" | "fetchImage" | "logger" | "reportDirectory" | "storage"
  >
>;

type StoryPreviewEntry = {
  mediaPk: string;
  source: string;
};

function getImageHash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function getRelativeReportImagePath(reportDirectory: string, rawKey: string): string {
  return path
    .relative(reportDirectory, path.resolve(BASE_CACHE_DIR, IMAGES_STORAGE_DIR, rawKey))
    .split(path.sep)
    .join("/");
}

function isPresent(value: string | null): value is string {
  return Boolean(value);
}

function getJpegRawKey(namespace: string, imageKey: string): string {
  return `${namespace}/${imageKey}.jpg`;
}

async function cacheImage(
  source: string,
  namespace: string,
  options: ResolvedCacheReportImagesOptions & { mediaPk?: string },
): Promise<string | null> {
  const imageKey = options.mediaPk ?? getImageHash(source);
  const rawKey = getJpegRawKey(namespace, imageKey);

  if (await options.storage.hasItem(rawKey)) {
    return getRelativeReportImagePath(options.reportDirectory, rawKey);
  }

  const response = await options.fetchImage(source);
  if (!response.ok) {
    options.logger.warn(`could not cache image ${source}: HTTP ${response.status}`);
    return null;
  }

  const body = Buffer.from(await response.arrayBuffer());

  try {
    await options.storage.setItemRaw(rawKey, await options.convertToJpeg(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.logger.warn(`could not convert image ${source} to JPEG: ${message}`);
    return null;
  }

  return getRelativeReportImagePath(options.reportDirectory, rawKey);
}

function resolveCacheOptions(options: CacheReportImagesOptions): ResolvedCacheReportImagesOptions {
  return {
    convertToJpeg: options.convertToJpeg ?? convertImageToJpeg,
    fetchImage: options.fetchImage ?? globalThis.fetch,
    logger: options.logger,
    reportDirectory: options.reportDirectory ?? path.resolve(BASE_CACHE_DIR, "reports"),
    storage: options.storage ?? imageCacheStorage,
  };
}

async function cacheProfilePics(
  report: StoriesManifestReport,
  options: ResolvedCacheReportImagesOptions,
): Promise<Map<string, string>> {
  const profilePicPathByUrl = new Map<string, string>();
  const profilePicUrls = report.output.users
    .map((user) => user.profile_pic_url)
    .filter((url) => isPresent(url));

  for (const source of new Set(profilePicUrls)) {
    try {
      const cachedPath = await cacheImage(source, "avatars", options);

      if (cachedPath !== null && cachedPath.length > 0) {
        profilePicPathByUrl.set(source, cachedPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.logger.warn(`could not cache image ${source}: ${message}`);
    }
  }

  return profilePicPathByUrl;
}

function getStoryPreviewEntries(report: StoriesManifestReport): StoryPreviewEntry[] {
  return report.output.users
    .flatMap((user) =>
      user.stories.map((story) => ({
        mediaPk: story.media_pk,
        source: story.preview_image_url,
      })),
    )
    .filter((entry): entry is StoryPreviewEntry => isPresent(entry.source));
}

async function cacheStoryPreviewByMediaPk(
  entries: StoryPreviewEntry[],
  options: ResolvedCacheReportImagesOptions,
): Promise<Map<string, string>> {
  const storyPreviewPathByMediaPk = new Map<string, string>();

  for (const { mediaPk, source } of new Map(
    entries.map((entry) => [entry.mediaPk, entry]),
  ).values()) {
    try {
      const cachedPath = await cacheImage(source, "story-previews", { ...options, mediaPk });

      if (cachedPath !== null && cachedPath.length > 0) {
        storyPreviewPathByMediaPk.set(mediaPk, cachedPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.logger.warn(`could not cache image ${source}: ${message}`);
    }
  }

  return storyPreviewPathByMediaPk;
}

function mapStoryPreviewPathsByUrl(
  entries: StoryPreviewEntry[],
  storyPreviewPathByMediaPk: Map<string, string>,
): Map<string, string> {
  const storyPreviewPathByUrl = new Map<string, string>();

  for (const { mediaPk, source } of entries) {
    const cachedPath = storyPreviewPathByMediaPk.get(mediaPk);

    if (cachedPath !== undefined && cachedPath.length > 0) {
      storyPreviewPathByUrl.set(source, cachedPath);
    }
  }

  return storyPreviewPathByUrl;
}

export async function cacheReportImages(
  report: StoriesManifestReport,
  options: CacheReportImagesOptions,
): Promise<CachedReportImages> {
  const resolvedOptions = resolveCacheOptions(options);
  const profilePicPathByUrl = await cacheProfilePics(report, resolvedOptions);
  const storyPreviewEntries = getStoryPreviewEntries(report);
  const storyPreviewPathByMediaPk = await cacheStoryPreviewByMediaPk(
    storyPreviewEntries,
    resolvedOptions,
  );

  return {
    profilePicPathByUrl,
    storyPreviewPathByUrl: mapStoryPreviewPathsByUrl(
      storyPreviewEntries,
      storyPreviewPathByMediaPk,
    ),
  };
}
