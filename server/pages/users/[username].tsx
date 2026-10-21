import { getRequestEvent } from "solid-js/web";
import { $page } from "../../store.ts";
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

export default function TimelineRoute() {
  const data = getRequestEvent()?.locals.page ?? $page.get();
  if (data?.page !== "timeline") {
    throw new Error("Timeline data could not be loaded");
  }
  return <UserTimelinePage {...data.props} />;
}
