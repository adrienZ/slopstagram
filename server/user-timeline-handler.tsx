import { HTTPError } from "nitro/h3";
import { createStoryCards } from "./story-card-view-model.ts";
import type { StoryCardSources } from "./story-card-view-model.ts";
import type { UserTimeline } from "./user-timeline.ts";
import type { TimelineContentProps } from "./pages/users/[username].tsx";
import { createUserTimeline, getTimelinePreviewPaths } from "./user-timeline.ts";

function getTimelineViewModel(
  timeline: UserTimeline,
  previewPaths: Map<string, string>,
): StoryCardSources {
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

export function loadUserTimeline(username: string): TimelineContentProps {
  const timeline = createUserTimeline(username);
  if (timeline === null) {
    throw new HTTPError({ status: 404, message: `no published stories found for ${username}` });
  }
  const previewPaths = getTimelinePreviewPaths(timeline.stories);
  const storyByMediaPk = new Map(
    createStoryCards(timeline.timelineUser, getTimelineViewModel(timeline, previewPaths)).map(
      (story) => [story.mediaPk, story],
    ),
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

  return {
    timeline: {
      avatarPath: timeline.avatarPath,
      timelineUser: timeline.timelineUser,
      stories: timeline.stories,
      years: timeline.years,
    },
    stories,
  };
}
