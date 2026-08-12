import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { BASE_CACHE_DIR, REPORTS_STORAGE_DIR } from "../sdk/lib/cache-service.ts";
import { StoriesManifestReportSchema } from "../sdk/lib/story-schemas.ts";
import type { StoriesManifestReport } from "../sdk/lib/types.ts";

export const reportDirectory = path.resolve(BASE_CACHE_DIR, REPORTS_STORAGE_DIR);

export async function getCachedReportKeys(): Promise<string[]> {
  return (await readdir(reportDirectory))
    .filter((file) => /^stories-report-.*\.json$/u.test(file))
    .toSorted();
}

export async function readCachedReport(reportKey: string): Promise<StoriesManifestReport> {
  if (!/^stories-report-.*\.json$/u.test(reportKey)) {
    throw new Error(`invalid cached report key: ${reportKey}`);
  }

  return StoriesManifestReportSchema.parse(
    JSON.parse(await readFile(path.join(reportDirectory, reportKey), "utf8")),
  );
}
