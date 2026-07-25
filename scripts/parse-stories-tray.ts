import { readFile } from "node:fs/promises";
import process from "node:process";
import { parseStoriesTrayReport } from "./lib/parser-service.js";
import type { StoriesReport } from "./lib/types.js";

function getInputPath(): string {
  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new Error(
      "Usage: tsx scripts/parse-stories-tray.ts <stories-report.json>",
    );
  }

  return inputPath;
}

async function main(): Promise<void> {
  const inputPath = getInputPath();
  const rawReport = await readFile(inputPath, "utf8");
  const report = JSON.parse(rawReport) as StoriesReport;
  const parsedTray = parseStoriesTrayReport(report);

  process.stdout.write(`${JSON.stringify(parsedTray, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
