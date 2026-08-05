import { STORY_MEDIA_TYPES, type StoryOutputUser } from "../../scripts/lib/types.ts";
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

export function StoryCard({
  count,
  position,
  story,
  user,
  userName,
  viewModel,
}: StoryCardProps) {
  const source = story.preview_image_url?.trim();
  if (!source) return null;

  const preview = viewModel.cachedImages.storyPreviewPathByUrl.get(source);
  if (!preview) return null;
  const vision = viewModel.visionByPreviewUrl.get(source);
  const avatar = user.profile_pic_url
    ? viewModel.cachedImages.profilePicPathByUrl.get(user.profile_pic_url)
    : undefined;
  const mediaType =
    story.media_type === STORY_MEDIA_TYPES.IMAGE
      ? "Image"
      : story.media_type === STORY_MEDIA_TYPES.VIDEO
        ? "Vidéo"
        : "";

  return (
    <div class="story-slide">
      <button
        class="story-image-button"
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
        data-story-apple-caption={story.apple_caption.trim()}
        data-story-vision-ocr={vision?.text ?? ""}
        data-story-vision-description={vision?.visual ?? ""}
        aria-label={`Ouvrir aperçu ${story.media_pk}`}
      >
        <img class="story-preview" src={preview} alt={`aperçu ${story.media_pk}`} />
      </button>
    </div>
  );
}
