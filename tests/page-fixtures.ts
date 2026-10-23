import reportFixture from "./fixtures/stories-report-server.json";
import { StoriesManifestReportSchema } from "../sdk/lib/story-schemas.ts";
import type { ReportPageProps } from "../server/pages/report.tsx";
import type { TimelineContentProps } from "../server/pages/users/$username.tsx";
import { getRankedUsers } from "../server/helper.ts";
import { createStoryCards } from "../server/story-card-view-model.ts";
import type { UserTimeline } from "../server/user-timeline.ts";

const report = StoriesManifestReportSchema.parse(reportFixture);
const caption = "</script><script>caption</script>";
export const reportProps: ReportPageProps = {
  date: "26 juillet 2026 à 11:48 UTC+2",
  selectedDate: "2026-07-26",
  today: "2026-07-26",
  availableDates: ["2026-07-25", "2026-07-26"],
  sidebarUsers: [{ username: "outside-feed", avatarPath: null }],
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

export const timelineEntry = {
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
  stories: [timelineEntry],
  timelineUser: {
    full_name: timelineEntry.full_name,
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
    username: timelineEntry.username,
  },
  visionByPreviewUrl: new Map(),
  years: [
    {
      label: "2026",
      months: [
        {
          key: "2026-01",
          label: "janvier",
          days: [{ key: "2026-01-01", label: "01", stories: [timelineEntry] }],
        },
      ],
    },
  ],
};

export const timelineProps: TimelineContentProps = {
  today: "2026-10-23",
  stickerKinds: ["hashtag", "link", "location", "mention", "music"],
  sidebarUsers: [
    { username: "timeline-user", avatarPath: "/media/avatar.jpg" },
    { username: "other-user", avatarPath: null },
  ],
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
