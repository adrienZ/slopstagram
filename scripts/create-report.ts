import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  BASE_CACHE_DIR,
  REPORTS_STORAGE_DIR,
  reportsStorage,
} from "./lib/cache-service.ts";
import { resolveOllamaUserSummariesForReport } from "./lib/ollama-user-summary-service.ts";
import { cacheReportImages } from "./lib/image-cache-service.ts";
import { createLogger, type Logger } from "./lib/logging-service.ts";
import { resolveVisionForReport } from "./lib/vision-service.ts";
import { formatStoriesReportHtml } from "./lib/report-html-service.ts";
import { fetchStories } from "./fetch-stories.ts";

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
    if (pathToFileURL(filePath).pathname.endsWith(".html")) {
      return {
        args: [filePath],
        command: "open",
      };
    }

    return {
      args: ["-a", "TextEdit", filePath],
      command: "open",
    };
  }

  if (process.platform === "win32") {
    return {
      args: ["/c", "start", "", "notepad", filePath],
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

async function main(): Promise<void> {
  const timestamp = formatFilenameTimestamp(new Date());
  const outputFileName = `stories-report-${timestamp}.json`;
  const htmlOutputFileName = `stories-report-${timestamp}.html`;
  const fetchStoriesArgs = process.argv.slice(2);
  const logger = createLogger("create-report", (message) => {
    process.stderr.write(`${message}\n`);
  });

  logger.info(`creating report ${outputFileName}`);
  const report = await fetchStories(fetchStoriesArgs, {
    logger,
    reportName: outputFileName,
  });
  await reportsStorage.setItem(outputFileName, report);
  const outputPath = resolve(BASE_CACHE_DIR, REPORTS_STORAGE_DIR, outputFileName);
  const htmlOutputPath = resolve(
    BASE_CACHE_DIR,
    REPORTS_STORAGE_DIR,
    htmlOutputFileName,
  );
  const cachedImages = await cacheReportImages(report, {
    logger,
    reportDirectory: resolve(BASE_CACHE_DIR, REPORTS_STORAGE_DIR),
  });
  const visionByPreviewUrl = await resolveVisionForReport(
    report,
    cachedImages,
    {
      logger,
      reportDirectory: resolve(BASE_CACHE_DIR, REPORTS_STORAGE_DIR),
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
  const counts = report.metadata.counts;

  logger.info(
    [
      `stories=${counts.stories}`,
      `cache_hits=${counts.cache_hits}`,
      `fetched=${counts.fetched}`,
      `failed=${counts.failed}`,
    ].join(" "),
  );
  logger.info(`wrote report ${outputPath}`);
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
