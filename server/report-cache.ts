import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { BASE_CACHE_DIR, REPORTS_STORAGE_DIR } from "../scripts/lib/cache-service.ts";
import type { StoriesManifestReport } from "../scripts/lib/types.ts";

export const reportDirectory = path.resolve(BASE_CACHE_DIR, REPORTS_STORAGE_DIR);

export async function getCachedReportKeys(): Promise<string[]> {
  return (await readdir(reportDirectory))
    .filter((file) => /^stories-report-.*\.json$/.test(file))
    .sort();
}

export async function readCachedReport(reportKey: string): Promise<StoriesManifestReport> {
  if (!/^stories-report-.*\.json$/.test(reportKey)) {
    throw new Error(`invalid cached report key: ${reportKey}`);
  }

  return JSON.parse(
    await readFile(path.join(reportDirectory, reportKey), "utf8"),
  ) as StoriesManifestReport;
}
