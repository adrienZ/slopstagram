import { getQuery } from "nitro/h3";
import type { H3Event } from "nitro/h3";
import { z } from "zod";
import { ReportPage } from "./components/report-page.tsx";
import { getReportKeys, readReport } from "./report-repository.ts";
import { createReportViewModel } from "./report-view-model.ts";

export function renderReport(event: H3Event): globalThis.Response {
  try {
    const reportKeys = getReportKeys();
    const query = getQuery(event);
    const reportQuery = query.report;
    const parsedReportKey = z.string().safeParse(reportQuery);
    const selectedReportKey = parsedReportKey.success ? parsedReportKey.data : reportKeys.at(-1);

    if (selectedReportKey === undefined || selectedReportKey.length === 0) {
      throw new Error("no stories reports found");
    }

    const viewModel = createReportViewModel(readReport(selectedReportKey));

    return ReportPage({ reportKeys, selectedReportKey, viewModel });
  } catch (error) {
    return new globalThis.Response(error instanceof Error ? error.message : String(error), {
      status: 404,
    });
  }
}
