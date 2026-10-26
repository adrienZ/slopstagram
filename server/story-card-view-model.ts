import {
  STORY_MEDIA_TYPES,
  type StoryOutputUser,
  type UserTimelineStory,
} from "../sdk/lib/types.ts";
import { presentSticker, type StickerPresentation } from "./sticker-presentation.ts";
import type { SidebarUser } from "./sidebar-users.ts";
import { musicStickerItems, type MusicStickerItem } from "./music-preview.ts";
import { formatUserName, getStoryUrl } from "./helper.ts";
import type { ReportViewModel } from "./report-view-model.ts";

export type StoryCardSources = Pick<
  ReportViewModel,
  "appleCaptionByMediaPk" | "cachedImages" | "visionByPreviewUrl"
>;

export interface StoryCardViewModel {
  stickerDetails?: {
    text?: string;
    stickers?: Array<StickerPresentation>;
    music: Array<MusicStickerItem>;
  };
  mediaPk: string;
  preview: string;
  alt: string;
  url: string;
  userName: string;
  avatar?: string;
  position: number;
  count: number;
  mediaType: string;
  stickers: string;
  locations: string;
  igCaption: string;
  appleCaption: string;
  visionOcr: string;
  visionDescription: string;
}

export function withStoryStickers(
  cards: Array<StoryCardViewModel>,
  stories: Array<Pick<UserTimelineStory, "story">>,
  users: Array<SidebarUser> = [],
) {
  const detailsByMediaPk = new Map(
    stories.map(({ story }) => [
      story.pk,
      {
        stickers: (story.annotations?.stickers ?? [])
          .filter(({ kind }) => kind !== "music")
          .map(({ kind, label }) => presentSticker(kind, label, users, true)),
        music: musicStickerItems(story.annotations),
      },
    ]),
  );
  return cards.map((card) => ({ ...card, stickerDetails: detailsByMediaPk.get(card.mediaPk) }));
}

function textOrDash(value: string | undefined): string {
  return value === undefined || value.length === 0 ? "—" : value;
}

function getMediaType(story: StoryOutputUser["stories"][number]): string {
  if (story.media_type === STORY_MEDIA_TYPES.IMAGE) {
    return "Image";
  }
  return story.media_type === STORY_MEDIA_TYPES.VIDEO ? "Vidéo" : "—";
}

export function createStoryCards(
  user: StoryOutputUser,
  sources: StoryCardSources,
): Array<StoryCardViewModel> {
  const userName = formatUserName(user);
  const profilePicUrl = user.profile_pic_url?.trim();
  const avatar =
    profilePicUrl === undefined
      ? undefined
      : sources.cachedImages.profilePicPathByUrl.get(profilePicUrl);

  return user.stories.flatMap((story, index) => {
    const source = story.preview_image_url?.trim();
    if (source === undefined || source.length === 0) {
      return [];
    }
    const preview = sources.cachedImages.storyPreviewPathByUrl.get(source);
    if (preview === undefined || preview.length === 0) {
      return [];
    }
    const vision = sources.visionByPreviewUrl.get(source);

    return [
      {
        mediaPk: story.media_pk,
        preview,
        alt: `aperçu ${story.media_pk}`,
        url: getStoryUrl(user.username, story.media_pk),
        userName,
        avatar: avatar === "" ? undefined : avatar,
        position: index + 1,
        count: user.stories.length,
        mediaType: getMediaType(story),
        stickers: textOrDash(story.stickers.join(", ")),
        locations: textOrDash(story.locations.join("\n")),
        igCaption: textOrDash(story.ig_caption.trim()),
        appleCaption: textOrDash(sources.appleCaptionByMediaPk.get(story.media_pk)?.trim()),
        visionOcr: textOrDash(vision?.text),
        visionDescription: textOrDash(vision?.visual),
      },
    ];
  });
}
