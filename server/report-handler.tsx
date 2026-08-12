import { getQuery } from "nitro/h3";
import type { H3Event } from "nitro/h3";
import { ReportPage } from "./components/report-page.tsx";
import { getCachedReportKeys, readCachedReport } from "./report-cache.ts";
import { createReportViewModel } from "./report-view-model.ts";

export async function renderReport(event: H3Event): Promise<globalThis.Response> {
  try {
    const reportKeys = await getCachedReportKeys();
    const query = getQuery(event);
    const reportQuery = query.report;
    const selectedReportKey = typeof reportQuery === "string" ? reportQuery : reportKeys.at(-1);

    if (selectedReportKey === undefined || selectedReportKey.length === 0) {
      throw new Error("no cached stories reports found");
    }

    const viewModel = await createReportViewModel(await readCachedReport(selectedReportKey));

    return ReportPage({ reportKeys, selectedReportKey, viewModel });
  } catch (error) {
    return new globalThis.Response(error instanceof Error ? error.message : String(error), {
      status: 404,
    });
  }
}
