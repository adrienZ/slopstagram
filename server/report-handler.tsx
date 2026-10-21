import "@tanstack/react-start/server-only";
import { HTTPError } from "nitro/h3";
import { z } from "zod";
import { getReportUserKey } from "../sdk/lib/report-user-key-service.ts";
import { formatReportDate, getRankedUsers } from "./helper.ts";
import { createStoryCards } from "./story-card-view-model.ts";
import type { ReportContentProps } from "./pages/report.tsx";
import { getReportKeys, readReport } from "./report-repository.ts";
import { createReportViewModel } from "./report-view-model.ts";

export function loadReport(reportQuery: string | null): ReportContentProps {
  try {
    const reportKeys = getReportKeys();
    const parsedReportKey = z.string().safeParse(reportQuery);
    const selectedReportKey = parsedReportKey.success ? parsedReportKey.data : reportKeys.at(-1);

    if (selectedReportKey === undefined || selectedReportKey.length === 0) {
      throw new HTTPError({ status: 404, message: "no stories reports found" });
    }

    const viewModel = createReportViewModel(readReport(selectedReportKey));

    const users = getRankedUsers(viewModel.report).map((user) => ({
      user,
      avatar: viewModel.cachedImages.profilePicPathByUrl.get(user.profile_pic_url?.trim() ?? ""),
      summary: viewModel.userSummaryByUserKey.get(getReportUserKey(user)),
      stories: createStoryCards(user, viewModel),
    }));
    return {
      date: formatReportDate(viewModel.report.metadata.created_at),
      reportKeys,
      selectedReportKey,
      users,
    };
  } catch (error) {
    throw new HTTPError({
      status: 404,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
