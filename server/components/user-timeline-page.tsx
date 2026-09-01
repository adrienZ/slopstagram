import cx from "clsx";
import { css, js } from "mono-jsx/jsx-runtime";
import { formatUserName, lightboxScript } from "../helper.ts";
import type { UserTimeline } from "../user-timeline.ts";
import { getTimelinePreviewPaths } from "../user-timeline.ts";
import { Lightbox, LightboxStyles } from "./lightbox.tsx";
import { StoryCard, StoryCardStyles, type StoryCardViewModel } from "./story-card.tsx";

const userTimelineStyles = css`
  :root {
    color-scheme: light dark;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    background: #f6f7f9;
    color: #1f2933;
  }

  body {
    margin: 0;
    background: #f6f7f9;
    color: #1f2933;
  }

  main {
    max-width: 1440px;
    margin: auto;
    padding: 32px 24px 48px;
  }

  .timeline-back {
    color: #465463;
    display: inline-block;
    margin-bottom: 24px;
  }

  .timeline-user-header {
    align-items: center;
    display: flex;
    gap: 18px;
    margin-bottom: 40px;
  }

  .timeline-avatar,
  .timeline-avatar-placeholder {
    background: #d9dee7;
    border-radius: 8px;
    height: 96px;
    object-fit: cover;
    width: 96px;
  }

  .timeline-user-header h1 {
    font-size: 28px;
    margin: 0;
  }

  .timeline-user-header p {
    color: #5b6774;
    margin: 4px 0 0;
  }

  .timeline-year {
    border-left: 2px solid #ccd4dd;
    margin: 0 0 40px 47px;
    padding-left: 28px;
  }

  .timeline-year > h2 {
    font-size: 25px;
    margin: 0 0 22px -42px;
  }

  .timeline-month {
    margin: 0 0 28px;
  }

  .timeline-month > h3 {
    font-size: 19px;
    margin: 0 0 14px;
    text-transform: capitalize;
  }

  .timeline-day {
    display: grid;
    gap: 14px;
    grid-template-columns: 42px minmax(0, 1fr);
    margin: 0 0 22px;
  }

  .timeline-day-label {
    align-items: center;
    background: #e8edf3;
    border-radius: 999px;
    display: flex;
    font-size: 16px;
    font-weight: 700;
    height: 38px;
    justify-content: center;
    width: 38px;
  }

  .timeline-day-stories {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding: 2px 0 14px;
  }

  @media (max-width: 760px) {
    main {
      padding: 24px 16px;
    }

    .timeline-year {
      margin-left: 18px;
      padding-left: 20px;
    }

    .timeline-year > h2 {
      margin-left: -32px;
    }
  }
`;

function UserTimelineStyles() {
  return <style>{userTimelineStyles}</style>;
}

function getTimelineViewModel(timeline: UserTimeline): StoryCardViewModel {
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

function TimelineGroups({ timeline, userName }: { timeline: UserTimeline; userName: string }) {
  const cardViewModel = getTimelineViewModel(timeline);
  const storyByMediaPk = new Map(
    timeline.timelineUser.stories.map((story, position) => [story.media_pk, { position, story }]),
  );

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
                      if (card === undefined) return null;

                      return (
                        <StoryCard
                          count={timeline.timelineUser.stories.length}
                          position={card.position + 1}
                          story={card.story}
                          user={timeline.timelineUser}
                          userName={userName}
                          viewModel={cardViewModel}
                        />
                      );
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

  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Stories de ${userName}`}</title>
        <UserTimelineStyles />
        <StoryCardStyles />
        <LightboxStyles />
      </head>
      <body>
        <main>
          <TimelineHeader timeline={timeline} userName={userName} />
          <TimelineGroups timeline={timeline} userName={userName} />
        </main>
        <Lightbox />
        <script>{js(lightboxScript)}</script>
      </body>
    </html>
  );
}
