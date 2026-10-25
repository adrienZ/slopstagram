import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { getReport } from "../query-service.ts";

import type { UserSectionProps } from "../components/user-section.tsx";
import { Lightbox } from "../components/lightbox.tsx";
import { StoryLayout } from "../components/story-layout.tsx";
import { getDisabledStoryDates, navigateToReportDate } from "../story-navigation.ts";
import { formatStoryViewTitle, storyDateSchema } from "../../sdk/lib/story-date-service.ts";
import { UserSection } from "../components/user-section.tsx";
import type { SidebarUser } from "../sidebar-users.ts";

export interface ReportPageProps {
  date: string;
  selectedDate: string;
  today: string;
  availableDates: Array<string>;
  sidebarUsers: Array<SidebarUser>;
  users: Array<UserSectionProps>;
}

export function ReportPage({
  date,
  selectedDate,
  today,
  availableDates,
  sidebarUsers,
  users,
  selectedStory,
}: ReportPageProps & { selectedStory?: string }) {
  return (
    <StoryLayout
      selectedDate={selectedDate}
      today={today}
      onSelectDate={navigateToReportDate}
      disabledDates={getDisabledStoryDates(availableDates)}
      title="Stories"
      users={sidebarUsers}
    >
      <h1 className="tw:text-[28px] tw:font-bold">{formatStoryViewTitle(selectedDate, today)}</h1>
      {selectedDate === today && <p className="tw:mb-4">{`Fil chargé le ${date}`}</p>}
      {users.length === 0 && (
        <p className="tw:my-4">
          {selectedDate === today
            ? "Aucune story publiée dans les dernières 24 heures."
            : "Aucune story publiée ce jour-là."}
        </p>
      )}
      {users.map((props) => (
        <UserSection key={props.user.username} {...props} />
      ))}
      <Lightbox stories={users.flatMap((user) => user.stories)} selectedStory={selectedStory} />
    </StoryLayout>
  );
}

export const Route = createFileRoute("/report")({
  validateSearch: z.object({
    story: z.coerce.string().optional(),
    date: z.preprocess(
      (value) => storyDateSchema.safeParse(value).data,
      storyDateSchema.optional(),
    ),
  }),
  loaderDeps: ({ search }) => ({ date: search.date }),
  beforeLoad: ({ search }) => ({ selectedStory: search.story }),
  loader: async ({ deps, context }) => {
    const report = await getReport({ data: { ...deps, story: context.selectedStory } });
    if (
      context.selectedStory !== undefined &&
      report.selectedDate !== (deps.date ?? report.today)
    ) {
      redirect({
        throw: true,
        to: "/report",
        search: { date: report.selectedDate, story: context.selectedStory },
        replace: true,
      });
    }
    return report;
  },
  staleTime: Infinity,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? formatStoryViewTitle(loaderData.selectedDate, loaderData.today)
          : "Stories",
      },
    ],
  }),
  component: () => (
    <ReportPage {...Route.useLoaderData()} selectedStory={Route.useSearch().story} />
  ),
});
