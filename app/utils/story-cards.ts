import { STORY_MEDIA_TYPES } from "@@/core/story-types.ts";
import type { OutdatedVision } from "@@/core/lib/vision-analysis-service.ts";
import type { StoryOutputUser } from "@@/core/report-types.ts";
import type { UserTimelineStory } from "@@/core/repositories/story-repository.ts";
import { presentSticker, type StickerPresentation } from "./sticker-presentation.ts";
import type { SidebarUser } from "../loaders/sidebar-users.ts";
import { stickerPlace, stickerPlaces } from "./timeline-stickers.ts";
import { musicStickerItems, type MusicStickerItem } from "./music-preview.ts";
import { formatUserName, getStoryUrl } from "./helper.ts";
import type { CachedReportImages } from "@@/core/lib/image-cache-service.ts";
import type { VisionResult } from "@@/core/entities/vision.ts";

export interface StoryCardSources {
  appleCaptionByMediaPk: Map<string, string>;
  cachedImages: CachedReportImages;
  visionByPreviewUrl: Map<string, VisionResult>;
  outdatedVisionByPreviewUrl?: Map<string, OutdatedVision>;
}

export interface StoryCardData {
  stickerDetails?: {
    text?: string;
    stickers?: Array<StickerPresentation>;
    music: Array<MusicStickerItem>;
  };
  mediaPk: string;
  username: string;
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
  visionOutdated?: OutdatedVision;
}

export function withStoryStickers(
  cards: Array<StoryCardData>,
  stories: Array<Pick<UserTimelineStory, "story">>,
  users: Array<SidebarUser> = [],
) {
  const detailsByMediaPk = new Map(
    stories.map(({ story }) => {
      const places = stickerPlaces(story.annotations);
      return [
        story.pk,
        {
          stickers: (story.annotations?.stickers ?? [])
            .filter(({ kind }) => kind !== "music")
            .map((sticker) =>
              presentSticker(
                sticker.kind,
                sticker.label,
                users,
                true,
                stickerPlace(places, sticker),
              ),
            ),
          music: musicStickerItems(story.annotations),
        },
      ];
    }),
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
): Array<StoryCardData> {
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
    const visionOutdated = sources.outdatedVisionByPreviewUrl?.get(source);

    const card: StoryCardData = {
      mediaPk: story.media_pk,
      username: user.username,
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
    };
    if (visionOutdated !== undefined) {
      card.visionOutdated = visionOutdated;
    }
    return [card];
  });
}
