import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getUserTimeline } from "../../query-service.ts";

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
      <a className="tw:mb-6 tw:inline-block tw:text-muted-foreground" href="/">
        ← Tous les utilisateurs
      </a>
      <header className="tw:mb-10 tw:flex tw:items-center tw:gap-4.5">
        {timeline.avatarPath === null ? (
          <div className="tw:size-24 tw:rounded-lg tw:bg-muted" />
        ) : (
          <img
            className="tw:size-24 tw:rounded-lg tw:bg-muted tw:object-cover"
            src={timeline.avatarPath}
            alt={`${userName} avatar`}
            width="96"
            height="96"
          />
        )}
        <div>
          <h1 className="tw:text-[28px] tw:font-bold">{userName}</h1>
          <p className="tw:mt-1 tw:text-muted-foreground">{`${timeline.stories.length} story${timeline.stories.length > 1 ? "s" : ""} · dates de publication`}</p>
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
        <section
          key={year.label}
          className="tw:mb-10 tw:ml-11.75 tw:border-l-2 tw:border-border tw:pl-7 tw:max-[760px]:ml-4.5 tw:max-[760px]:pl-5"
        >
          <h2 className="tw:mb-5.5 tw:-ml-10.5 tw:text-[25px] tw:font-bold tw:max-[760px]:-ml-8">
            {year.label}
          </h2>
          {year.months.map((month) => (
            <section key={month.key} className="tw:mb-7">
              <h3 className="tw:mb-3.5 tw:text-[19px] tw:font-bold tw:capitalize">{month.label}</h3>
              {month.days.map((day) => (
                <section
                  key={day.key}
                  className="tw:mb-5.5 tw:grid tw:grid-cols-[42px_minmax(0,1fr)] tw:gap-3.5"
                >
                  <div className="tw:flex tw:size-9.5 tw:items-center tw:justify-center tw:rounded-full tw:bg-muted tw:text-base tw:font-bold">
                    {day.label}
                  </div>
                  <div className="tw:flex tw:gap-3 tw:overflow-x-auto tw:pt-0.5 tw:pb-3.5">
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
    <section className="tw:mb-10">
      <h2 className="tw:my-5 tw:text-2xl tw:leading-normal tw:font-bold">
        Latest sticker occurrences (up to 50)
      </h2>
      {occurrences.length === 0 ? (
        <p className="tw:my-4">No sticker occurrences stored.</p>
      ) : (
        <div className="tw:overflow-x-auto">
          <table className="tw:w-full tw:border-collapse">
            <thead>
              <tr>
                <th
                  className="tw:border tw:border-border tw:p-2 tw:text-left tw:align-top"
                  scope="col"
                >
                  Story preview
                </th>
                <th
                  className="tw:border tw:border-border tw:p-2 tw:text-left tw:align-top"
                  scope="col"
                >
                  Story date
                </th>
                <th
                  className="tw:border tw:border-border tw:p-2 tw:text-left tw:align-top"
                  scope="col"
                >
                  Sticker type
                </th>
                <th
                  className="tw:border tw:border-border tw:p-2 tw:text-left tw:align-top"
                  scope="col"
                >
                  Sticker label
                </th>
              </tr>
            </thead>
            <tbody>
              {occurrences.map(({ entry, sticker, key }) => {
                const card = storyByMediaPk.get(entry.story.pk);
                const date = new Date(entry.taken_at * 1000).toISOString();
                return (
                  <tr key={key}>
                    <td className="tw:border tw:border-border tw:p-2 tw:text-left tw:align-top tw:wrap-anywhere tw:whitespace-pre-wrap">
                      {card === undefined ? (
                        "Preview unavailable"
                      ) : (
                        <StoryCard story={card} compact />
                      )}
                    </td>
                    <td className="tw:border tw:border-border tw:p-2 tw:text-left tw:align-top tw:wrap-anywhere tw:whitespace-pre-wrap">
                      <time dateTime={date}>{formatReportDate(date)}</time>
                    </td>
                    <td className="tw:border tw:border-border tw:p-2 tw:text-left tw:align-top tw:wrap-anywhere tw:whitespace-pre-wrap">
                      {sticker.kind}
                    </td>
                    <td className="tw:border tw:border-border tw:p-2 tw:text-left tw:align-top tw:wrap-anywhere tw:whitespace-pre-wrap">
                      {sticker.label}
                    </td>
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
      <TimelineHeader timeline={timeline} userName={formatUserName(timeline.timelineUser)} />
      <TimelineStickers timeline={timeline} storyByMediaPk={storyByMediaPk} />
      <TimelineGroups timeline={timeline} storyByMediaPk={storyByMediaPk} />
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
  }),
  component: () => (
    <UserTimelinePage {...Route.useLoaderData()} selectedStory={Route.useSearch().story} />
  ),
});
