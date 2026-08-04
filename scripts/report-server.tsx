import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BASE_CACHE_DIR, REPORTS_STORAGE_DIR } from "./lib/cache-service.ts";
import type { StoriesManifestReport } from "./lib/types.ts";
import { createReportViewModel } from "./renderer/report-data.ts";
import { ReportPage } from "./renderer/report-page.tsx";

const reportDirectory = path.resolve(BASE_CACHE_DIR, REPORTS_STORAGE_DIR);

export async function readLatestReport(): Promise<StoriesManifestReport> {
  const files = (await readdir(reportDirectory)).filter((file) => /^stories-report-.*\.json$/.test(file)).sort();
  const latest = files.at(-1);
  if (!latest) throw new Error(`no cached stories reports found in ${reportDirectory}`);
  return JSON.parse(await readFile(path.join(reportDirectory, latest), "utf8")) as StoriesManifestReport;
}

export const app = new Hono();
app.use("/images/*", serveStatic({ root: BASE_CACHE_DIR }));
app.get("/report", async (context) => {
  try { return context.html(<ReportPage viewModel={await createReportViewModel(await readLatestReport())} />); }
  catch (error) { return context.text(error instanceof Error ? error.message : String(error), 404); }
});

function main(): void {
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port });
  process.stdout.write(`Report server listening on http://localhost:${port}/report\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
