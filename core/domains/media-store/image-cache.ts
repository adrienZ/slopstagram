import { Buffer } from "node:buffer";
import path from "node:path";
import { IMAGES_STORAGE_DIR, readBytes, type ImageCacheStorage } from "./cache-storage.ts";
import { media } from "./media-urls.ts";
import { convertImageToJpeg } from "./image-conversion.ts";
import type { FetchImage } from "@@/core/domains/runtime/fetch-boundaries.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import type { StoriesManifestReport } from "@@/core/domains/fetch-run/report-types.ts";

type ImageCacheRuntime = Pick<Runtime, "fetchImage" | "logger" | "storage">;

interface CacheReportImagesOptions {
  convertToJpeg?: typeof convertImageToJpeg;
}

export interface CachedReportImages {
  profilePicPathByUrl: Map<string, string>;
  storyPreviewPathByUrl: Map<string, string>;
}

interface ResolvedCacheReportImagesOptions {
  convertToJpeg: typeof convertImageToJpeg;
  fetchImage: FetchImage;
  logger: Runtime["logger"];
  storage: ImageCacheStorage;
}

interface StoryPreviewEntry {
  mediaPk: string;
  source: string;
}

interface ProfilePicEntry {
  pk: string;
  source: string;
}

function getRelativeCacheImagePath(rawKey: string): string {
  return path.posix.join(IMAGES_STORAGE_DIR, rawKey);
}

export async function readCachedImage(
  images: ImageCacheStorage,
  cachedPath: string,
): Promise<Uint8Array | null> {
  const file = media.image.fromStoredPath(cachedPath);
  return file === null ? null : await readBytes(images, file.key);
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
    ? getRelativeCacheImagePath(rawKey)
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

  return getRelativeCacheImagePath(rawKey);
}

function resolveCacheOptions(
  runtime: ImageCacheRuntime,
  options: CacheReportImagesOptions,
): ResolvedCacheReportImagesOptions {
  return {
    convertToJpeg: options.convertToJpeg ?? convertImageToJpeg,
    fetchImage: runtime.fetchImage ?? globalThis.fetch,
    logger: runtime.logger,
    storage: runtime.storage.images,
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
      // oxlint-disable-next-line no-await-in-loop -- Serial image caching limits network, conversion, and storage pressure.
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

function getStoryPreviewEntries(report: StoriesManifestReport): Array<StoryPreviewEntry> {
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
  entries: Array<StoryPreviewEntry>,
  options: ResolvedCacheReportImagesOptions,
): Promise<Map<string, string>> {
  const storyPreviewPathByMediaPk = new Map<string, string>();

  for (const { mediaPk, source } of new Map(
    entries.map((entry) => [entry.mediaPk, entry]),
  ).values()) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- Serial image caching limits network, conversion, and storage pressure.
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
  entries: Array<StoryPreviewEntry>,
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
  runtime: ImageCacheRuntime,
  report: StoriesManifestReport,
  options: CacheReportImagesOptions = {},
): Promise<CachedReportImages> {
  const resolvedOptions = resolveCacheOptions(runtime, options);
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
