import { getReportUserKey } from "../lib/report-user-key-service.ts";
import { STORY_MEDIA_TYPES, type StoryOutputUser } from "../lib/types.ts";
import type { ReportViewModel } from "./report-data.ts";
import { lightboxScript, reportCss } from "./report-assets.ts";
import {
  formatReportDate,
  formatUserName,
  getRankedUsers,
  getStoryUrl,
} from "./report-helpers.ts";

type StoryCardProps = {
  count: number;
  position: number;
  story: StoryOutputUser["stories"][number];
  user: StoryOutputUser;
  userName: string;
  viewModel: ReportViewModel;
};

function StoryCard({
  count,
  position,
  story,
  user,
  userName,
  viewModel,
}: StoryCardProps) {
  const source = story.preview_image_url?.trim();

  if (!source) {
    return null;
  }

  const preview =
    viewModel.cachedImages.storyPreviewPathByUrl.get(source) ?? source;
  const vision = viewModel.visionByPreviewUrl.get(source);
  const avatar = user.profile_pic_url
    ? viewModel.cachedImages.profilePicPathByUrl.get(user.profile_pic_url) ??
      user.profile_pic_url
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

function UserSection({
  user,
  viewModel,
}: {
  user: StoryOutputUser;
  viewModel: ReportViewModel;
}) {
  const { report } = viewModel;
  const userName = formatUserName(user);
  const avatar = user.profile_pic_url
    ? viewModel.cachedImages.profilePicPathByUrl.get(user.profile_pic_url) ??
      user.profile_pic_url
    : undefined;
  const originalIndex = report.output.users.indexOf(user);
  const summary = viewModel.userSummaryByUserKey.get(
    getReportUserKey(user, originalIndex),
  );

  return (
    <section class="user-section">
      <div class="user-header">
        {avatar ? (
          <img
            class="avatar"
            src={avatar}
            alt={`${userName} avatar`}
            width="96"
            height="96"
          />
        ) : (
          <div class="avatar-placeholder" />
        )}
        <div>
          <h2>{userName}</h2>
        </div>
      </div>

      {summary && <p class="user-summary">{summary}</p>}

      {user.stories.length > 0 && (
        <div class="story-images">
          {user.stories.map((story, position) => (
            <StoryCard
              story={story}
              user={user}
              userName={userName}
              count={user.stories.length}
              position={position + 1}
              viewModel={viewModel}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Lightbox() {
  return (
    <dialog
      class="image-lightbox"
      id="image-lightbox"
      aria-label="Aperçu de l’image"
    >
      <button class="lightbox-close" type="button" aria-label="Fermer l’aperçu">
        ×
      </button>
      <button
        class="lightbox-nav lightbox-prev"
        type="button"
        aria-label="Image précédente"
        hidden
      >
        ‹
      </button>

      <div class="lightbox-content">
        <div class="lightbox-preview-panel">
          <div class="lightbox-header">
            <img class="lightbox-avatar" alt="" hidden />
            <div>
              <strong class="lightbox-username" />
              <span class="lightbox-count" />
            </div>
          </div>
          <img class="lightbox-image" alt="" />
        </div>

        <aside class="lightbox-details-panel" aria-label="Détails de la story">
          <h2>Détails</h2>
          <table class="lightbox-details-table">
            <tbody>
              <tr><th>Type</th><td class="lightbox-detail-media-type" /></tr>
              <tr><th>Story</th><td class="lightbox-detail-media-pk" /></tr>
              <tr><th>Stickers</th><td class="lightbox-detail-stickers" /></tr>
              <tr><th>Lieux</th><td class="lightbox-detail-locations" /></tr>
              <tr><th>Instagram</th><td class="lightbox-detail-ig-caption" /></tr>
              <tr><th>Apple OCR</th><td class="lightbox-detail-apple-caption" /></tr>
              <tr><th>Vision OCR</th><td class="lightbox-detail-vision-ocr" /></tr>
              <tr>
                <th>Vision description</th>
                <td class="lightbox-detail-vision-description" />
              </tr>
            </tbody>
          </table>
          <a class="lightbox-story-link" target="_blank" rel="noreferrer" hidden>
            Voir cette story sur Instagram
          </a>
        </aside>
      </div>

      <button
        class="lightbox-nav lightbox-next"
        type="button"
        aria-label="Image suivante"
        hidden
      >
        ›
      </button>
    </dialog>
  );
}

export function ReportPage({ viewModel }: { viewModel: ReportViewModel }) {
  const { report } = viewModel;
  const date = formatReportDate(report.metadata.created_at);

  return (
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Rapport Stories ${date}`}</title>
        <style dangerouslySetInnerHTML={{ __html: reportCss }} />
      </head>
      <body>
        <main>
          <h1>{`Rapport du ${date}`}</h1>
          {getRankedUsers(report).map((user) => (
            <UserSection user={user} viewModel={viewModel} />
          ))}
        </main>
        <Lightbox />
        <script dangerouslySetInnerHTML={{ __html: lightboxScript }} />
      </body>
    </html>
  );
}
