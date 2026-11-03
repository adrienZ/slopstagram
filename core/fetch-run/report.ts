import { resolveAppleCaptionsForReport } from "@@/core/vision/apple-caption.ts";
import { recordFetchRun } from "./fetch-run.ts";
import { createStoryFeed, readStoryFeedVision } from "@@/core/story-feed/story-feed.ts";
import { cacheReportImages } from "@@/core/media-store/image-cache.ts";
import { cacheReportAudio } from "@@/core/music/report-audio.ts";
import { persistReportInstagramUsers } from "@@/core/accounts/instagram-user.ts";
import type { ReportRepository } from "@@/core/database/repositories/report-repository.ts";
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

type CreateReportRuntime = { reports: Pick<ReportRepository, "save"> } & Parameters<
  typeof recordFetchRun
>[0] &
  Parameters<typeof fetchStories>[0] &
  Parameters<typeof cacheReportAudio>[0] &
  Parameters<typeof cacheReportImages>[0] &
  Parameters<typeof resolveAppleCaptionsForReport>[0] &
  Parameters<typeof resolveVisionForReport>[0] &
  Parameters<typeof persistReportInstagramUsers>[0] &
  Parameters<typeof createStoryFeed>[0] &
  Parameters<typeof readStoryFeedVision>[0] &
  Parameters<typeof resolveUserSummariesForReport>[0];

export async function createReport(
  runtime: CreateReportRuntime,
  options: CreateReportOptions = {},
): Promise<CreateReportResult> {
  const now = options.now ?? (() => new Date());
  return await recordFetchRun(
    runtime,
    async (run) => {
      const timestamp = formatFilenameTimestamp(run.startedAt);
      const outputFileName = `stories-report-${timestamp}-${run.id}.json`;
      runtime.logger.box(`${pkg.name} - report ${outputFileName}`);
      const report = await fetchStories(runtime, { now, reportName: outputFileName });
      run.report = report;
      // Keep the observation and failures even if enrichment or every media fetch fails.
      await runtime.reports.save(outputFileName, report);
      run.reportKey = outputFileName;
      const { counts } = report.metadata;
      if (counts.stories > 0 && counts.fetched === 0) {
        throw new Error(
          `No story media could be fetched (${counts.failed}/${counts.stories} failed). ${report.failures[0]?.message ?? "Instagram returned no story media"}`,
        );
      }
      await cacheReportAudio(runtime, report);
      const cachedImages = await cacheReportImages(runtime, report);
      await resolveAppleCaptionsForReport(runtime, report, cachedImages);
      await resolveVisionForReport(runtime, report, cachedImages);
      await persistReportInstagramUsers(runtime, report);
      // Generate from the same canonical, active story set used by the user app.
      const feedUsers = createStoryFeed(runtime, now());
      await resolveUserSummariesForReport(
        runtime,
        { output: { users: feedUsers } },
        { visionByPreviewUrl: readStoryFeedVision(runtime, feedUsers) },
      );
      await runtime.reports.save(outputFileName, report);
      runtime.logger.info(
        [`stories=${counts.stories}`, `fetched=${counts.fetched}`, `failed=${counts.failed}`].join(
          " ",
        ),
      );
      runtime.logger.success(`saved report ${outputFileName} to the database`);

      return { outputFileName, reportKey: outputFileName, report };
    },
    { now },
  );
}
