import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { jsx } from "hono/jsx";
import { renderToString } from "hono/jsx/dom/server";
import { pathToFileURL } from "node:url";
import { BASE_CACHE_DIR } from "../scripts/lib/cache-service.ts";
import { ReportPage } from "./components/report-page.tsx";
import { getCachedReportKeys, readCachedReport } from "./report-cache.ts";
import { createReportViewModel } from "./report-view-model.ts";

export const app = new Hono();
app.use("/images/*", serveStatic({ root: BASE_CACHE_DIR }));
app.get("/report", async (context) => {
  try {
    const reportKeys = await getCachedReportKeys();
    const selectedReportKey = context.req.query("report") ?? reportKeys.at(-1);
    if (!selectedReportKey) {
      throw new Error("no cached stories reports found");
    }
    const viewModel = await createReportViewModel(
      await readCachedReport(selectedReportKey),
    );
    return context.html(
      renderToString(jsx(ReportPage, { reportKeys, selectedReportKey, viewModel })),
    );
  } catch (error) {
    return context.text(
      error instanceof Error ? error.message : String(error),
      404,
    );
  }
});

function main(): void {
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port });
  process.stdout.write(`Report server listening on http://localhost:${port}/report\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

export default app;