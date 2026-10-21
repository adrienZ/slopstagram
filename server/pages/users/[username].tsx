import { createAsync, useParams } from "@solidjs/router";
import type { RouteDefinition } from "@solidjs/router";
import { getUserTimeline } from "../../query-service.ts";
import { Link, Title } from "@solidjs/meta";
import cx from "clsx";
import { formatUserName } from "../../helper.ts";
import type { StoryCardViewModel } from "../../story-card-view-model.ts";
import type { UserTimeline } from "../../user-timeline.ts";
import { BaseStyles } from "../../components/base-styles.tsx";
import { Lightbox, LightboxStyles } from "../../components/lightbox.tsx";
import { StoryCard, StoryCardStyles } from "../../components/story-card.tsx";

function UserTimelineStyles() {
  return <Link rel="stylesheet" href="/css/user-timeline-page.css" />;
}

function TimelineHeader({
  timeline,
  userName,
}: {
  timeline: TimelineContentProps["timeline"];
  userName: string;
}) {
  return (
    <>
      <a class={cx("timeline-back")} href="/">
        ← Tous les utilisateurs
      </a>
      <header class={cx("timeline-user-header")}>
        {timeline.avatarPath === null ? (
          <div class={cx("timeline-avatar-placeholder")} />
        ) : (
          <img
            class={cx("timeline-avatar")}
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
        <section class={cx("timeline-year")}>
          <h2>{year.label}</h2>
          {year.months.map((month) => (
            <section class={cx("timeline-month")}>
              <h3>{month.label}</h3>
              {month.days.map((day) => (
                <section class={cx("timeline-day")}>
                  <div class={cx("timeline-day-label")}>{day.label}</div>
                  <div class={cx("timeline-day-stories")}>
                    {day.stories.map((entry) => {
                      const card = storyByMediaPk.get(entry.story.pk);
                      if (card === undefined) {
                        return null;
                      }

                      return <StoryCard story={card} />;
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

export function TimelineContent({ timeline, stories }: TimelineContentProps) {
  const storyByMediaPk = new Map(stories.map((story) => [story.mediaPk, story]));
  return (
    <>
      <main>
        <TimelineHeader timeline={timeline} userName={formatUserName(timeline.timelineUser)} />
        <TimelineGroups timeline={timeline} storyByMediaPk={storyByMediaPk} />
      </main>
      <Lightbox stories={stories} />
    </>
  );
}

export function UserTimelinePage(props: TimelineContentProps) {
  return (
    <>
      <Title>{`Stories de ${formatUserName(props.timeline.timelineUser)}`}</Title>
      <BaseStyles />
      <UserTimelineStyles />
      <StoryCardStyles />
      <LightboxStyles />
      <TimelineContent {...props} />
    </>
  );
}

export const route = {
  // oxlint-disable-next-line typescript/promise-function-async -- Preserve the query promise so the router handles preload rejections.
  preload: ({ params }) => getUserTimeline(params.username ?? ""),
} satisfies RouteDefinition;

export default function TimelineRoute() {
  const params = useParams();
  const data = createAsync(
    // oxlint-disable-next-line typescript/promise-function-async -- createAsync must receive the query promise directly during hydration.
    () => getUserTimeline(params.username ?? ""),
    { deferStream: true },
  );
  function renderPage() {
    const props = data();
    return props === undefined ? null : <UserTimelinePage {...props} />;
  }
  return <>{renderPage()}</>;
}
