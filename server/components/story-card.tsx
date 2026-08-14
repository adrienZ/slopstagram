import cx from "clsx";
import { css } from "mono-jsx/jsx-runtime";
import { STORY_MEDIA_TYPES, type StoryOutputUser } from "../../sdk/lib/types.ts";
import { getStoryUrl } from "../helper.ts";
import type { ReportViewModel } from "../report-view-model.ts";

type StoryCardProps = {
  count: number;
  position: number;
  story: StoryOutputUser["stories"][number];
  user: StoryOutputUser;
  userName: string;
  viewModel: ReportViewModel;
};

export const storyCardStyles = css`
  .story-slide {
    flex: none;
    scroll-snap-align: start;
  }

  .story-image-button {
    border: 0;
    padding: 0;
    background: transparent;
    cursor: zoom-in;
  }

  .story-preview {
    width: 210px;
    max-width: calc(55vw - 36px);
    border-radius: 8px;
    display: block;
    box-shadow: 0 1px 3px #0003;
  }

  @media (max-width: 760px) {
    .story-preview {
      width: 72vw;
      max-width: none;
    }
  }
`;

export function StoryCardStyles() {
  return <style>{storyCardStyles}</style>;
}

export function StoryCard({ count, position, story, user, userName, viewModel }: StoryCardProps) {
  const source = story.preview_image_url?.trim();
  if (source === undefined || source.length === 0) return null;

  const preview = viewModel.cachedImages.storyPreviewPathByUrl.get(source);
  if (preview === undefined || preview.length === 0) return null;
  const vision = viewModel.visionByPreviewUrl.get(source);
  const profilePicUrl = user.profile_pic_url?.trim();
  const avatar =
    profilePicUrl !== undefined && profilePicUrl.length > 0
      ? viewModel.cachedImages.profilePicPathByUrl.get(profilePicUrl)
      : undefined;
  const mediaType =
    story.media_type === STORY_MEDIA_TYPES.IMAGE
      ? "Image"
      : story.media_type === STORY_MEDIA_TYPES.VIDEO
        ? "Vidéo"
        : "";

  return (
    <div class={cx("story-slide")}>
      <button
        class={cx("story-image-button")}
        type="button"
        data-full-src={preview}
        data-full-alt={`aperçu ${story.media_pk}`}
        data-story-url={getStoryUrl(user.username, story.media_pk)}
        data-user-name={userName}
        data-user-avatar={avatar}
        data-user-image-index={position}
        data-user-image-count={count}
        data-story-media-type={mediaType}
        data-story-media-pk={story.media_pk}
        data-story-stickers={story.stickers.join(", ")}
        data-story-locations={story.locations.join("\n")}
        data-story-ig-caption={story.ig_caption.trim()}
        data-story-apple-caption={viewModel.appleCaptionByMediaPk.get(story.media_pk)?.trim() ?? ""}
        data-story-vision-ocr={vision?.text ?? ""}
        data-story-vision-description={vision?.visual ?? ""}
        aria-label={`Ouvrir aperçu ${story.media_pk}`}
      >
        <img class={cx("story-preview")} src={preview} alt={`aperçu ${story.media_pk}`} />
      </button>
    </div>
  );
}
