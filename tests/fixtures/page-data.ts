import reportJson from "./stories-report-server.json" with { type: "json" };
import { StoriesManifestReportSchema } from "../../sdk/lib/story-schemas.ts";
import { getRankedUsers } from "../../server/helper.ts";
import { createStoryCards } from "../../server/story-card-view-model.ts";
import type { ReportContentProps } from "../../server/pages/report.tsx";
import type { TimelineContentProps } from "../../server/pages/users/[username].tsx";
import type { UserTimeline } from "../../server/user-timeline.ts";

const report = StoriesManifestReportSchema.parse(reportJson);
export const earlierReportKey = "stories-report-2026-07-25.json";
export const latestReportKey = "stories-report-2026-07-26.json";
const caption = "</script><script>caption</script>";
export const reportProps: ReportContentProps = {
  date: "26 juillet 2026 à 11:48 UTC+2",
  reportKeys: [earlierReportKey, latestReportKey],
  selectedReportKey: latestReportKey,
  users: getRankedUsers(report).map((user) => ({
    user,
    avatar: user.profile_pic_url === null ? undefined : "/media/avatars/avatar.jpg",
    summary: "A text-focused story with extracted details.",
    stories: createStoryCards(user, {
      appleCaptionByMediaPk: new Map([["story-pk-1", "apple <text>"]]),
      cachedImages: {
        profilePicPathByUrl: new Map([["images/avatars/avatar.jpg", "/media/avatars/avatar.jpg"]]),
        storyPreviewPathByUrl: new Map([
          ["images/story-previews/story-pk-1.jpg", "/media/story-previews/story-pk-1.jpg"],
        ]),
      },
      visionByPreviewUrl: new Map(),
    }).map((story) => ({ ...story, igCaption: caption })),
  })),
};

const entry = {
  full_name: "Timeline User",
  locations: [],
  owner_pk: "user-pk",
  story: { media_type: 1, pk: "story-pk", taken_at: 1_767_225_600 },
  stickers: [],
  taken_at: 1_767_225_600,
  username: "timeline-user",
};
const timeline: UserTimeline = {
  appleCaptionByMediaPk: new Map([["story-pk", "apple <text>"]]),
  avatarPath: "/media/avatar.jpg",
  stories: [entry],
  timelineUser: {
    full_name: entry.full_name,
    profile_pic_url: "images/avatars/user-pk.jpg",
    reel_ids: [],
    stories: [
      {
        ig_caption: "</script><script>caption</script>",
        locations: [],
        media_pk: "story-pk",
        media_type: "image",
        preview_image_url: "images/story-previews/story-pk.jpg",
        status: "ok",
        stickers: [],
      },
    ],
    username: entry.username,
  },
  visionByPreviewUrl: new Map(),
  years: [
    {
      label: "2026",
      months: [
        {
          key: "2026-01",
          label: "janvier",
          days: [{ key: "2026-01-01", label: "01", stories: [entry] }],
        },
      ],
    },
  ],
};

export const timelineProps: TimelineContentProps = {
  timeline: {
    avatarPath: timeline.avatarPath,
    timelineUser: timeline.timelineUser,
    stories: timeline.stories,
    years: timeline.years,
  },
  stories: createStoryCards(timeline.timelineUser, {
    appleCaptionByMediaPk: timeline.appleCaptionByMediaPk,
    cachedImages: {
      profilePicPathByUrl: new Map([["images/avatars/user-pk.jpg", "/media/avatar.jpg"]]),
      storyPreviewPathByUrl: new Map([
        ["images/story-previews/story-pk.jpg", "/media/story-previews/story-pk.jpg"],
      ]),
    },
    visionByPreviewUrl: timeline.visionByPreviewUrl,
  }),
};
