import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path, { basename, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  BASE_CACHE_DIR,
  getStoryCacheKey,
  REPORTS_STORAGE_DIR,
  reportsStorage,
  storiesStorage,
} from "./lib/cache-service.ts";
import { cacheReportImages } from "./lib/image-cache-service.ts";
import { createLogger, type Logger } from "./lib/logging-service.ts";
import { resolveOllamaUserSummariesForReport } from "./lib/ollama-user-summary-service.ts";
import { resolveVisionForReport } from "./lib/vision-service.ts";
import { formatStoriesReportHtml } from "./lib/report-html-service.ts";
import {
  STORY_MEDIA_TYPES,
  type StoriesManifestReport,
  type StoryItem,
  type StoryMediaType,
  type StoryStorage,
} from "./lib/types.ts";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTimezoneOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  return `${sign}${pad(hours)}${pad(minutes)}`;
}

function formatFilenameTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day}T${hours}-${minutes}-${seconds}${formatTimezoneOffset(date)}`;
}

function getOpenCommand(filePath: string): { args: string[]; command: string } {
  if (process.platform === "darwin") {
    return {
      args: [filePath],
      command: "open",
    };
  }

  if (process.platform === "win32") {
    return {
      args: ["/c", "start", "", filePath],
      command: "cmd",
    };
  }

  return {
    args: [filePath],
    command: "xdg-open",
  };
}

function openReport(filePath: string, logger: Logger): Promise<void> {
  const { args, command } = getOpenCommand(filePath);

  return new Promise((resolveOpen) => {
    const opener = spawn(command, args, {
      stdio: "ignore",
    });

    opener.on("error", (error) => {
      logger.warn(`could not open report ${filePath}: ${error.message}`);
      resolveOpen();
    });

    opener.on("close", (code) => {
      if (code && code !== 0) {
        logger.warn(
          `could not open report ${filePath}: ${command} exited with code ${code}`,
        );
      }
      resolveOpen();
    });
  });
}

async function getLatestReportKey(): Promise<string> {
  const keys = (await reportsStorage.getKeys())
    .filter((key) => /^stories-report-.*\.json$/.test(key))
    .sort();
  const latestKey = keys.at(-1);

  if (!latestKey) {
    throw new Error(`no cached stories reports found in ${BASE_CACHE_DIR}/${REPORTS_STORAGE_DIR}`);
  }

  return latestKey;
}

async function readReport(reportArg: string | undefined): Promise<{
  report: StoriesManifestReport;
  reportKey: string;
}> {
  if (!reportArg) {
    const reportKey = await getLatestReportKey();
    const report = await reportsStorage.getItem(reportKey);

    if (!report) {
      throw new Error(`cached report ${reportKey} could not be read`);
    }

    return { report, reportKey };
  }

  if (path.isAbsolute(reportArg) || reportArg.includes(path.sep)) {
    const report = JSON.parse(await readFile(reportArg, "utf8")) as StoriesManifestReport;

    return {
      report,
      reportKey: basename(reportArg),
    };
  }

  const reportKey = reportArg;
  const report = await reportsStorage.getItem(reportKey);

  if (!report) {
    throw new Error(`cached report ${reportKey} could not be read`);
  }

  return { report, reportKey };
}

function formatStoryMediaType(value: unknown): StoryMediaType | null {
  if (value === STORY_MEDIA_TYPES.IMAGE || value === STORY_MEDIA_TYPES.VIDEO) {
    return value;
  }

  if (value === 1) {
    return STORY_MEDIA_TYPES.IMAGE;
  }

  if (value === 2) {
    return STORY_MEDIA_TYPES.VIDEO;
  }

  return null;
}

async function getCachedStoryMediaType(
  cacheKey: string,
  storage: StoryStorage,
): Promise<StoryMediaType | null> {
  const cachedStory = await storage.getItem(cacheKey);

  if (!cachedStory) {
    return null;
  }

  const story =
    typeof cachedStory === "string"
      ? (JSON.parse(cachedStory) as StoryItem)
      : (cachedStory as StoryItem);

  return formatStoryMediaType(story.media_type);
}

export async function backfillReportStoryMediaTypes(
  report: StoriesManifestReport,
  storage: StoryStorage = storiesStorage,
): Promise<void> {
  const mediaTypeByPk = new Map<string, StoryMediaType>();
  const cacheKeyByPk = new Map<string, string>();

  for (const user of report.manifest.users) {
    for (const story of user.stories) {
      cacheKeyByPk.set(story.media_pk, story.cache_key);

      const manifestMediaType = formatStoryMediaType(story.media_type);
      if (manifestMediaType) {
        mediaTypeByPk.set(story.media_pk, manifestMediaType);
        story.media_type = manifestMediaType;
        continue;
      }

      const cachedMediaType = await getCachedStoryMediaType(
        story.cache_key,
        storage,
      );
      if (cachedMediaType) {
        mediaTypeByPk.set(story.media_pk, cachedMediaType);
        story.media_type = cachedMediaType;
      }
    }
  }

  for (const user of report.output.users) {
    for (const story of user.stories) {
      const outputMediaType = formatStoryMediaType(story.media_type);
      if (outputMediaType) {
        story.media_type = outputMediaType;
        mediaTypeByPk.set(story.media_pk, outputMediaType);
        continue;
      }

      const knownMediaType = mediaTypeByPk.get(story.media_pk);
      if (knownMediaType) {
        story.media_type = knownMediaType;
        continue;
      }

      const cachedMediaType = await getCachedStoryMediaType(
        cacheKeyByPk.get(story.media_pk) ?? getStoryCacheKey(story.media_pk),
        storage,
      );
      story.media_type = cachedMediaType;

      if (cachedMediaType) {
        mediaTypeByPk.set(story.media_pk, cachedMediaType);
      }
    }
  }
}

async function main(): Promise<void> {
  const logger = createLogger("create-html-report", (message) => {
    process.stderr.write(`${message}\n`);
  });
  const { report, reportKey } = await readReport(process.argv[2]);
  const reportDirectory = resolve(BASE_CACHE_DIR, REPORTS_STORAGE_DIR);
  const htmlOutputFileName = `stories-report-${formatFilenameTimestamp(new Date())}.html`;
  const htmlOutputPath = resolve(reportDirectory, htmlOutputFileName);

  logger.info(`rendering html report from cached report ${reportKey}`);
  await backfillReportStoryMediaTypes(report);
  const cachedImages = await cacheReportImages(report, {
    fetchImage: async (url) => {
      throw new Error(`cache miss for ${url}`);
    },
    logger,
    reportDirectory,
  });
  const visionByPreviewUrl = await resolveVisionForReport(
    report,
    cachedImages,
    {
      logger,
      reportDirectory,
    },
  );
  const userSummaryByUserKey = await resolveOllamaUserSummariesForReport(report, {
    logger,
    visionByPreviewUrl,
  });

  await writeFile(
    htmlOutputPath,
    formatStoriesReportHtml(report, {
      ...cachedImages,
      visionByPreviewUrl,
      userSummaryByUserKey,
    }),
    "utf8",
  );

  logger.info(`wrote html report ${htmlOutputPath}`);
  await openReport(htmlOutputPath, logger);
  process.stdout.write(`${htmlOutputPath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
