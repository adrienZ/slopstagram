import "@tanstack/react-start/server-only";
import { getReportUserKey } from "../sdk/lib/report-user-key-service.ts";
import { formatReportDate } from "./helper.ts";
import { createReportFeed } from "../sdk/story-feed.ts";
import { createStoryCards, withStoryMusic } from "./story-card-view-model.ts";
import type { ReportPageProps } from "./pages/report.tsx";
import { createReportViewModel } from "./report-view-model.ts";
import { loadSidebarUsers } from "./sidebar-users.ts";
import { storyRepository } from "../sdk/repositories/story-repository.ts";

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
  const storedStories = feedUsers.flatMap((user) =>
    user.stories.flatMap(({ media_pk }) => {
      const story = storyRepository.findByMediaPk(media_pk);
      return story === null ? [] : [{ story }];
    }),
  );
  const users = feedUsers.map((user) => ({
    user,
    avatar: viewModel.cachedImages.profilePicPathByUrl.get(user.profile_pic_url?.trim() ?? ""),
    summary: viewModel.userSummaryByUserKey.get(getReportUserKey(user)),
    stories: withStoryMusic(createStoryCards(user, viewModel), storedStories),
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
