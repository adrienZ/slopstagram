import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getUserTimeline } from "../../query-service.ts";

import { cn } from "cn";
import { formatReportDate, formatUserName } from "../../helper.ts";
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
      <a className={cn("timeline-back")} href="/">
        ← Tous les utilisateurs
      </a>
      <header className={cn("timeline-user-header")}>
        {timeline.avatarPath === null ? (
          <div className={cn("timeline-avatar-placeholder")} />
        ) : (
          <img
            className={cn("timeline-avatar")}
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
        <section key={year.label} className={cn("timeline-year")}>
          <h2>{year.label}</h2>
          {year.months.map((month) => (
            <section key={month.key} className={cn("timeline-month")}>
              <h3>{month.label}</h3>
              {month.days.map((day) => (
                <section key={day.key} className={cn("timeline-day")}>
                  <div className={cn("timeline-day-label")}>{day.label}</div>
                  <div className={cn("timeline-day-stories")}>
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

function TimelineStickers({
  timeline,
  storyByMediaPk,
}: {
  timeline: TimelineContentProps["timeline"];
  storyByMediaPk: Map<string, StoryCardViewModel>;
}) {
  const occurrences = timeline.stories
    .flatMap((entry) =>
      (entry.story.annotations?.stickers ?? []).map((sticker, position) => ({
        entry,
        sticker,
        key: `${entry.story.pk}:${position}`,
      })),
    )
    .slice(0, 50);

  return (
    <section className={cn("timeline-stickers")}>
      <h2>Latest sticker occurrences (up to 50)</h2>
      {occurrences.length === 0 ? (
        <p>No sticker occurrences stored.</p>
      ) : (
        <div className={cn("timeline-stickers-scroll")}>
          <table>
            <thead>
              <tr>
                <th scope="col">Story preview</th>
                <th scope="col">Story date</th>
                <th scope="col">Sticker type</th>
                <th scope="col">Sticker label</th>
              </tr>
            </thead>
            <tbody>
              {occurrences.map(({ entry, sticker, key }) => {
                const card = storyByMediaPk.get(entry.story.pk);
                const date = new Date(entry.taken_at * 1000).toISOString();
                return (
                  <tr key={key}>
                    <td>
                      {card === undefined ? "Preview unavailable" : <StoryCard story={card} />}
                    </td>
                    <td>
                      <time dateTime={date}>{formatReportDate(date)}</time>
                    </td>
                    <td>{sticker.kind}</td>
                    <td>{sticker.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
        <TimelineStickers timeline={timeline} storyByMediaPk={storyByMediaPk} />
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
