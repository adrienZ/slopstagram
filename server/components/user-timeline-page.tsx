import { css } from "mono-jsx/jsx-runtime";
import cx from "clsx";
import { formatUserName } from "../helper.ts";
import { createStoryCards } from "../story-card-view-model.ts";
import type { StoryCardSources, StoryCardViewModel } from "../story-card-view-model.ts";
import type { UserTimeline } from "../user-timeline.ts";
import { getTimelinePreviewPaths } from "../user-timeline.ts";
import { BaseStyles } from "./base-styles.tsx";
import { Lightbox, LightboxStyles } from "./lightbox.tsx";
import { StoryCard, StoryCardStyles } from "./story-card.tsx";

function UserTimelineStyles() {
  return (
    <style>{css`
      @import url("/css/user-timeline-page.css");
    `}</style>
  );
}

function getTimelineViewModel(timeline: UserTimeline): StoryCardSources {
  const previewPaths = getTimelinePreviewPaths(timeline.stories);
  const profilePicPathByUrl = new Map<string, string>();
  const profilePicUrl = timeline.timelineUser.profile_pic_url;

  if (profilePicUrl !== null && profilePicUrl !== undefined && timeline.avatarPath !== null) {
    profilePicPathByUrl.set(profilePicUrl, timeline.avatarPath);
  }

  return {
    appleCaptionByMediaPk: timeline.appleCaptionByMediaPk,
    cachedImages: {
      profilePicPathByUrl,
      storyPreviewPathByUrl: previewPaths,
    },
    visionByPreviewUrl: timeline.visionByPreviewUrl,
  };
}

function TimelineHeader({ timeline, userName }: { timeline: UserTimeline; userName: string }) {
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
  timeline: UserTimeline;
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

export function UserTimelinePage({ timeline }: { timeline: UserTimeline }) {
  const userName = formatUserName(timeline.timelineUser);
  const storyByMediaPk = new Map(
    createStoryCards(timeline.timelineUser, getTimelineViewModel(timeline)).map((story) => [
      story.mediaPk,
      story,
    ]),
  );
  const stories = timeline.years.flatMap((year) =>
    year.months.flatMap((month) =>
      month.days.flatMap((day) =>
        day.stories.flatMap((entry) => {
          const card = storyByMediaPk.get(entry.story.pk);
          return card === undefined ? [] : [card];
        }),
      ),
    ),
  );

  return (
    <html lang="fr" app={{ storyMediaPk: "", stories: [] }}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Stories de ${userName}`}</title>
        <BaseStyles />
        <UserTimelineStyles />
        <StoryCardStyles />
        <LightboxStyles />
      </head>
      <body>
        <main>
          <TimelineHeader timeline={timeline} userName={userName} />
          <TimelineGroups timeline={timeline} storyByMediaPk={storyByMediaPk} />
        </main>
        <Lightbox stories={stories} />
      </body>
    </html>
  );
}
