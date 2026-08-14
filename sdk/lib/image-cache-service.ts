import { Buffer } from "node:buffer";
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

type ProfilePicEntry = { pk: string; source: string };

function getRelativeReportImagePath(reportDirectory: string, rawKey: string): string {
  return path
    .relative(reportDirectory, path.resolve(BASE_CACHE_DIR, IMAGES_STORAGE_DIR, rawKey))
    .split(path.sep)
    .join("/");
}

function isPresent(value: string | null | undefined): value is string {
  return Boolean(value);
}

function getJpegRawKey(namespace: string, imageKey: string): string {
  return `${namespace}/${imageKey}.jpg`;
}

async function cacheImage(
  source: string,
  namespace: string,
  options: ResolvedCacheReportImagesOptions & { imageKey: string; refresh?: boolean },
): Promise<string | null> {
  const rawKey = getJpegRawKey(namespace, options.imageKey);
  const cachedPath = (await options.storage.hasItem(rawKey))
    ? getRelativeReportImagePath(options.reportDirectory, rawKey)
    : null;

  if (cachedPath !== null && options.refresh !== true) {
    return cachedPath;
  }

  const response = await options.fetchImage(source);
  if (!response.ok) {
    options.logger.warn(`could not cache image ${source}: HTTP ${response.status}`);
    return cachedPath;
  }

  const body = Buffer.from(await response.arrayBuffer());

  try {
    await options.storage.setItemRaw(rawKey, await options.convertToJpeg(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.logger.warn(`could not convert image ${source} to JPEG: ${message}`);
    return cachedPath;
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
  const entries = report.manifest.users
    .map((user) => ({ pk: user.pk, source: user.profile_pic_url }))
    .filter((entry): entry is ProfilePicEntry => isPresent(entry.pk) && isPresent(entry.source));

  for (const { pk, source } of new Map(entries.map((entry) => [entry.pk, entry])).values()) {
    try {
      const cachedPath = await cacheImage(source, "avatars", {
        ...options,
        imageKey: pk,
        refresh: true,
      });

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
      const cachedPath = await cacheImage(source, "story-previews", {
        ...options,
        imageKey: mediaPk,
      });

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

function replaceReportImageSources(
  report: StoriesManifestReport,
  cachedImages: CachedReportImages,
): void {
  for (const user of [...report.manifest.users, ...report.output.users]) {
    const profileSource = user.profile_pic_url?.trim();
    user.profile_pic_url =
      profileSource !== undefined && profileSource.length > 0
        ? (cachedImages.profilePicPathByUrl.get(profileSource) ?? null)
        : null;

    for (const story of user.stories) {
      const previewSource = story.preview_image_url?.trim();
      story.preview_image_url =
        previewSource !== undefined && previewSource.length > 0
          ? (cachedImages.storyPreviewPathByUrl.get(previewSource) ?? null)
          : null;
    }
  }
}

function addLocalPathAliases(cachedImages: CachedReportImages): void {
  for (const imagePath of cachedImages.profilePicPathByUrl.values()) {
    cachedImages.profilePicPathByUrl.set(imagePath, imagePath);
  }
  for (const imagePath of cachedImages.storyPreviewPathByUrl.values()) {
    cachedImages.storyPreviewPathByUrl.set(imagePath, imagePath);
  }
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

  const cachedImages = {
    profilePicPathByUrl,
    storyPreviewPathByUrl: mapStoryPreviewPathsByUrl(
      storyPreviewEntries,
      storyPreviewPathByMediaPk,
    ),
  };
  replaceReportImageSources(report, cachedImages);
  addLocalPathAliases(cachedImages);

  return cachedImages;
}
