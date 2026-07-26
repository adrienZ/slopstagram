import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  BASE_CACHE_DIR,
  STRAY_STORAGE_DIR,
  strayStorage,
} from "./lib/cache-service.ts";
import { createLogger } from "./lib/logging-service.ts";
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

async function main(): Promise<void> {
  const timestamp = formatFilenameTimestamp(new Date());
  const outputFileName = `stories-report-${timestamp}.json`;
  const fetchStoriesArgs = process.argv.slice(2);
  const logger = createLogger("create-report", (message) => {
    process.stderr.write(`${message}\n`);
  });

  logger.info(`creating report ${outputFileName}`);
  const report = await fetchStories(fetchStoriesArgs, {
    logger,
    reportName: outputFileName,
  });
  await strayStorage.setItem(outputFileName, JSON.stringify(report, null, 2));
  const outputPath = resolve(BASE_CACHE_DIR, STRAY_STORAGE_DIR, outputFileName);
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
  process.stdout.write(`${outputPath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
