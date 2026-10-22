import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getUserTimeline } from "../../query-service.ts";

import cx from "clsx";
import { formatUserName } from "../../helper.ts";
import type { StoryCardViewModel } from "../../story-card-view-model.ts";
import type { UserTimeline } from "../../user-timeline.ts";
import { Lightbox } from "../../components/lightbox.tsx";
import { StoryCard } from "../../components/story-card.tsx";

function TimelineHeader({
  timeline,
  userName,
}: {
  timeline: TimelineContentProps["timeline"];
  userName: string;
}) {
  return (
    <>
      <a className={cx("timeline-back")} href="/">
        ← Tous les utilisateurs
      </a>
      <header className={cx("timeline-user-header")}>
        {timeline.avatarPath === null ? (
          <div className={cx("timeline-avatar-placeholder")} />
        ) : (
          <img
            className={cx("timeline-avatar")}
            src={timeline.avatarPath}
            alt={`${userName} avatar`}
            width="96"
            height="96"
          />
        )}
        <div>
          <h1>{userName}</h1>
          <p>{`${timeline.stories.length} story${timeline.stories.length > 1 ? "s" : ""} · dates de publication`}</p>
        </div>
      </header>
    </>
  );
}

function TimelineGroups({
  timeline,
  storyByMediaPk,
}: {
  timeline: TimelineContentProps["timeline"];
  storyByMediaPk: Map<string, StoryCardViewModel>;
}) {
  return (
    <>
      {timeline.years.map((year) => (
        <section key={year.label} className={cx("timeline-year")}>
          <h2>{year.label}</h2>
          {year.months.map((month) => (
            <section key={month.key} className={cx("timeline-month")}>
              <h3>{month.label}</h3>
              {month.days.map((day) => (
                <section key={day.key} className={cx("timeline-day")}>
                  <div className={cx("timeline-day-label")}>{day.label}</div>
                  <div className={cx("timeline-day-stories")}>
                    {day.stories.map((entry) => {
                      const card = storyByMediaPk.get(entry.story.pk);
                      if (card === undefined) {
                        return null;
                      }

                      return <StoryCard key={card.mediaPk} story={card} />;
                    })}
                  </div>
                </section>
              ))}
            </section>
          ))}
        </section>
      ))}
    </>
  );
}

export interface TimelineContentProps {
  timeline: Pick<UserTimeline, "avatarPath" | "timelineUser" | "stories" | "years">;
  stories: Array<StoryCardViewModel>;
}

export function TimelineContent({
  timeline,
  stories,
  selectedStory,
}: TimelineContentProps & { selectedStory?: string }) {
  const storyByMediaPk = new Map(stories.map((story) => [story.mediaPk, story]));
  return (
    <>
      <main>
        <TimelineHeader timeline={timeline} userName={formatUserName(timeline.timelineUser)} />
        <TimelineGroups timeline={timeline} storyByMediaPk={storyByMediaPk} />
      </main>
      <Lightbox stories={stories} selectedStory={selectedStory} />
    </>
  );
}

export function UserTimelinePage(props: TimelineContentProps & { selectedStory?: string }) {
  return (
    <>
      <TimelineContent {...props} />
    </>
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
    links: ["user-timeline-page", "story-card", "lightbox"].map((name) => ({
      rel: "stylesheet",
      href: `/css/${name}.css`,
    })),
  }),
  component: () => (
    <UserTimelinePage {...Route.useLoaderData()} selectedStory={Route.useSearch().story} />
  ),
});
