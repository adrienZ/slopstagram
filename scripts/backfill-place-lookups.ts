import process from "node:process";
import { pathToFileURL } from "node:url";
import { APP_DATABASE_PATH } from "../sdk/lib/app-data-paths.ts";
import { createLogger } from "../sdk/lib/logging-service.ts";
import { closeInstagramSession, openInstagramSession } from "../sdk/lib/playwright-service.ts";
import { backfillPlaceLookups, listPlacesToBackfill } from "../sdk/place-backfill.ts";
import { storyRepository } from "../sdk/repositories/story-repository.ts";
import { sleep } from "../sdk/story-retry-service.ts";
import { createInstagramClient } from "../sdk/story-client-service.ts";

const DEFAULT_PAUSE_MS = 1500;

function readOption(name: string): number | undefined {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : Number(process.argv[index + 1]);
  if (value !== undefined && !Number.isInteger(value)) {
    throw new TypeError(`${name} expects a whole number`);
  }
  return value;
}

async function main(): Promise<void> {
  const limit = readOption("--limit");
  const pauseMs = readOption("--pause-ms") ?? DEFAULT_PAUSE_MS;
  const places = listPlacesToBackfill(storyRepository, limit);
  process.stdout.write(`database: ${APP_DATABASE_PATH}\n`);
  process.stdout.write(`${places.length} places to look up\n`);
  if (process.argv.includes("--dry-run")) {
    for (const { instagramPlaceId, mediaPk } of places) {
      process.stdout.write(`${instagramPlaceId} (story ${mediaPk})\n`);
    }
    return;
  }
  const session = await openInstagramSession();
  try {
    const count = await backfillPlaceLookups(
      createInstagramClient(session),
      storyRepository,
      createLogger("backfill-place-lookups"),
      { limit, pauseMs, sleep, now: () => new Date() },
    );
    process.stdout.write(`${count} places looked up\n`);
  } finally {
    await closeInstagramSession(session);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
