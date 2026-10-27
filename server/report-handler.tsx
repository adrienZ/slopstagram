import "@tanstack/react-start/server-only";
import { getReportUserKey } from "../sdk/lib/report-user-key-service.ts";
import { formatReportDate } from "./helper.ts";
import { createReportFeed } from "../sdk/story-feed.ts";
import { createStoryCards } from "./story-card-view-model.ts";
import type { ReportPageProps } from "./pages/report.tsx";
import { createReportViewModel } from "./report-view-model.ts";
import { loadSidebarUsers } from "./sidebar-users.ts";

export function loadReport(
  now: Date = new Date(),
  selectedDate?: string,
  selectedStory?: string,
): ReportPageProps {
  const {
    today,
    selectedDate: day,
    availableDates,
    users: feedUsers,
  } = createReportFeed(now, selectedDate, { selectedStory });
  const viewModel = createReportViewModel(feedUsers);
  const users = feedUsers.map((user) => ({
    user,
    avatar: viewModel.cachedImages.profilePicPathByUrl.get(user.profile_pic_url?.trim() ?? ""),
    summary: viewModel.userSummaryByUserKey.get(getReportUserKey(user)),
    stories: createStoryCards(user, viewModel),
  }));
  return {
    date: formatReportDate(now.toISOString()),
    selectedDate: day,
    today,
    availableDates,
    sidebarUsers: loadSidebarUsers(),
    users,
  };
}
