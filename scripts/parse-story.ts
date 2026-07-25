import { readFile } from "node:fs/promises";
import process from "node:process";
import { parseStoryReport } from "./lib/parser-service.js";
import type { StoriesMediaReport } from "./lib/types.js";

function getArgs(): { inputPath: string; pk: string } {
  const inputPath = process.argv[2];
  const pk = process.argv[3];

  if (!inputPath || !pk) {
    throw new Error("Usage: node --import tsx scripts/parse-story.ts <stories-report.json> <story-pk>");
  }

  return { inputPath, pk };
}

async function main(): Promise<void> {
  const { inputPath, pk } = getArgs();
  const rawReport = await readFile(inputPath, "utf8");
  const report = JSON.parse(rawReport) as StoriesMediaReport;
  const parsedStory = parseStoryReport(report, pk);

  process.stdout.write(`${JSON.stringify(parsedStory, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
