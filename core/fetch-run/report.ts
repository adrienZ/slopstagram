import { resolveAppleCaptionsForReport } from "@@/core/vision/apple-caption.ts";
import { recordFetchRun } from "./fetch-run.ts";
import { createStoryFeed, readStoryFeedVision } from "@@/core/story-feed/story-feed.ts";
import { cacheReportImages } from "@@/core/media-store/image-cache.ts";
import { cacheReportAudio } from "@@/core/music/report-audio.ts";
import { persistReportInstagramUsers } from "@@/core/accounts/instagram-user.ts";
import type { Runtime } from "@@/core/runtime/runtime.ts";
import type { StoriesManifestReport } from "./report-types.ts";
import { resolveUserSummariesForReport } from "@@/core/accounts/user-summary.ts";
import { resolveVisionForReport } from "@@/core/vision/vision-report.ts";
import { fetchStories } from "./stories.ts";
import pkg from "../../package.json" with { type: "json" };

export interface CreateReportOptions {
  now?: () => Date;
}

export interface CreateReportResult {
  outputFileName: string;
  reportKey: string;
  report: StoriesManifestReport;
}

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

export async function createReport(
  runtime: Runtime,
  options: CreateReportOptions = {},
): Promise<CreateReportResult> {
  const { appleVision, fetchRuns, logger, reports, stories, storage, summaries, users, vision } =
    runtime;
  const now = options.now ?? (() => new Date());
  return await recordFetchRun(
    { fetchRuns },
    async (run) => {
      const timestamp = formatFilenameTimestamp(run.startedAt);
      const outputFileName = `stories-report-${timestamp}-${run.id}.json`;
      logger.box(`${pkg.name} - report ${outputFileName}`);
      const report = await fetchStories(
        { client: runtime.client, logger, storage, stories },
        { now, reportName: outputFileName },
      );
      run.report = report;
      // Keep the observation and failures even if enrichment or every media fetch fails.
      await reports.save(outputFileName, report);
      run.reportKey = outputFileName;
      const { counts } = report.metadata;
      if (counts.stories > 0 && counts.fetched === 0) {
        throw new Error(
          `No story media could be fetched (${counts.failed}/${counts.stories} failed). ${report.failures[0]?.message ?? "Instagram returned no story media"}`,
        );
      }
      await cacheReportAudio(report, {
        storyRepository: stories,
        fetchMedia: runtime.fetchMedia,
        storage,
      });
      const cachedImages = await cacheReportImages(report, {
        fetchImage: runtime.fetchImage,
        logger,
        storage: storage.images,
      });
      await resolveAppleCaptionsForReport(
        { appleVision, logger, runAppleOcr: runtime.runAppleOcr, storage },
        report,
        cachedImages,
      );
      await resolveVisionForReport(
        { fetchOllama: runtime.fetchOllama, logger, storage, vision },
        report,
        cachedImages,
      );
      await persistReportInstagramUsers({ users }, report);
      // Generate from the same canonical, active story set used by the user app.
      const feedUsers = createStoryFeed({ stories }, now());
      await resolveUserSummariesForReport(
        { fetchOllama: runtime.fetchOllama, logger, summaries },
        { output: { users: feedUsers } },
        { visionByPreviewUrl: readStoryFeedVision({ vision }, feedUsers) },
      );
      await reports.save(outputFileName, report);
      logger.info(
        [`stories=${counts.stories}`, `fetched=${counts.fetched}`, `failed=${counts.failed}`].join(
          " ",
        ),
      );
      logger.success(`saved report ${outputFileName} to the database`);

      return { outputFileName, reportKey: outputFileName, report };
    },
    { now },
  );
}
