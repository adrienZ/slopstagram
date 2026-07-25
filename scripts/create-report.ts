import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fetchStories } from "./fetch-stories.js";

const OUTPUT_DIR = ".tmp/reports";

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
  const outputDirectory = join(process.cwd(), OUTPUT_DIR);
  const outputPath = join(outputDirectory, `stories-report-${timestamp}.json`);
  const fetchStoriesArgs = process.argv.slice(2);

  await mkdir(outputDirectory, { recursive: true });

  const report = await fetchStories(fetchStoriesArgs);
  const reportJson = `${JSON.stringify(report, null, 2)}\n`;
  JSON.parse(reportJson);
  await writeFile(outputPath, reportJson);

  process.stdout.write(`${outputPath}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
