import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Card, CardHeader, CardTitle, CardDescription } from "../../shadcn/ui/card.tsx";
import { getUserTimeline } from "../../query-service.ts";

import { formatUserHandle, formatUserName } from "../../helper.ts";
import type { StoryCardViewModel } from "../../story-card-view-model.ts";
import type { UserTimeline } from "../../user-timeline.ts";
import { Lightbox } from "../../components/lightbox.tsx";
import { StoryLayout } from "../../components/story-layout.tsx";
import { useTimelineCalendar } from "../../hooks/use-timeline-calendar.ts";
import { groupTimelineStickers } from "../../timeline-stickers.ts";
import { TimelineStickers } from "../../components/timeline-stickers.tsx";
import { TimelineGallery } from "../../components/timeline-gallery.tsx";
import type { SidebarUser } from "../../sidebar-users.ts";

function TimelineHeader({
  timeline,
  userName,
}: {
  timeline: TimelineContentProps["timeline"];
  userName: string;
}) {
  const displayName = timeline.timelineUser.full_name?.trim();
  const handle = formatUserHandle(timeline.timelineUser.username);
  return (
    <>
      <a className="tw:mb-6 tw:inline-block tw:text-muted-foreground" href="/">
        ← Tous les utilisateurs
      </a>
      <Card className="tw:mb-8">
        <CardHeader className="tw:flex tw:flex-col tw:items-start tw:gap-4.5 tw:sm:flex-row tw:sm:items-center">
          {timeline.avatarPath === null ? (
            <div className="tw:size-30 tw:shrink-0 tw:rounded-full tw:bg-muted" />
          ) : (
            <img
              className="tw:size-30 tw:shrink-0 tw:rounded-full tw:bg-muted tw:object-cover"
              src={timeline.avatarPath}
              alt={`${userName} avatar`}
              width="120"
              height="120"
            />
          )}
          <div className="tw:min-w-0">
            <CardTitle>
              <h1 className="tw:text-[28px] tw:font-bold tw:wrap-anywhere">
                {displayName !== undefined && displayName.length > 0 ? displayName : handle}
              </h1>
            </CardTitle>
            <span className="tw:mt-1 tw:block tw:text-base tw:text-muted-foreground">{handle}</span>
            <CardDescription className="tw:mt-1">
              <p>{`${timeline.stories.length} story${timeline.stories.length > 1 ? "s" : ""} · dates de publication`}</p>
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    </>
  );
}

export interface TimelineContentProps {
  today: string;
  stickerKinds: Array<string>;
  sidebarUsers: Array<SidebarUser>;
  timeline: Pick<UserTimeline, "avatarPath" | "timelineUser" | "stories" | "years">;
  stories: Array<StoryCardViewModel>;
}

export function TimelineContent({
  timeline,
  stories,
  selectedStory,
  stickerKinds,
  sidebarUsers,
}: TimelineContentProps & { selectedStory?: string }) {
  const storyByMediaPk = new Map(stories.map((story) => [story.mediaPk, story]));
  return (
    <>
      <TimelineHeader timeline={timeline} userName={formatUserName(timeline.timelineUser)} />
      <TimelineStickers
        groups={groupTimelineStickers(timeline.stories, stickerKinds)}
        storyByMediaPk={storyByMediaPk}
        usernames={sidebarUsers.map((user) => user.username)}
      />
      {timeline.stories.length === 0 && <p>Aucune story enregistrée pour cet utilisateur.</p>}
      <TimelineGallery years={timeline.years} storyByMediaPk={storyByMediaPk} />
      <Lightbox stories={stories} selectedStory={selectedStory} />
    </>
  );
}

export function UserTimelinePage(props: TimelineContentProps & { selectedStory?: string }) {
  const days = props.timeline.years.flatMap((year) =>
    year.months.flatMap((month) => month.days.map((day) => day.key)),
  );
  const calendar = useTimelineCalendar(days, props.today);
  return (
    <StoryLayout
      {...calendar}
      today={props.today}
      title={formatUserName(props.timeline.timelineUser)}
      users={props.sidebarUsers}
      selectedUsername={props.timeline.timelineUser.username}
    >
      <TimelineContent {...props} />
    </StoryLayout>
  );
}

export const Route = createFileRoute("/users/$username")({
  validateSearch: z.object({ story: z.coerce.string().optional() }),
  loader: async ({ params }) => await getUserTimeline({ data: params.username }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `Stories de ${formatUserName(loaderData.timeline.timelineUser)}`
          : "Stories",
      },
    ],
  }),
  component: () => (
    <UserTimelinePage {...Route.useLoaderData()} selectedStory={Route.useSearch().story} />
  ),
});
