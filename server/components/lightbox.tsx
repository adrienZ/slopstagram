import { useNavigate } from "@tanstack/react-router";
import cx from "clsx";
import type { StoryCardViewModel } from "../story-card-view-model.ts";

function LightboxDetailsRow(props: {
  label: string;
  className: string;
  value: string | undefined;
}) {
  return (
    <tr>
      <th>{props.label}</th>
      <td className={props.className}>{props.value ?? "—"}</td>
    </tr>
  );
}

function LightboxNavButton(props: {
  direction: number;
  className: string;
  label: string;
  text: string;
  hidden: boolean;
  onNavigate: (direction: number) => void;
}) {
  return (
    <button
      className={cx("lightbox-nav", props.className)}
      type="button"
      aria-label={props.label}
      hidden={props.hidden}
      onClick={() => {
        props.onNavigate(props.direction);
      }}
    >
      {props.text}
    </button>
  );
}

function mountDialog(element: HTMLDialogElement | null) {
  element?.showModal();
  return () => {
    element?.close();
  };
}

function LightboxDialog(props: { stories: Array<StoryCardViewModel>; story: StoryCardViewModel }) {
  const navigateTo = useNavigate();

  function selectedCount() {
    return `${props.story.position} / ${props.story.count}`;
  }

  function close() {
    void navigateTo({
      to: ".",
      search: (previous) => ({ ...previous, story: undefined }),
      replace: true,
      resetScroll: false,
    });
  }

  function navigate(direction: number) {
    if (props.stories.length === 0) {
      return;
    }
    const index = props.stories.findIndex((story) => story.mediaPk === props.story.mediaPk);
    void navigateTo({
      to: ".",
      search: (previous) => ({
        ...previous,
        story:
          props.stories[(index + direction + props.stories.length) % props.stories.length]?.mediaPk,
      }),
      replace: true,
      resetScroll: false,
    });
  }

  return (
    <dialog
      className={cx("image-lightbox")}
      id="image-lightbox"
      aria-label="Aperçu de l’image"
      ref={mountDialog}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
      onClose={(event) => {
        if (event.currentTarget.isConnected && !event.currentTarget.open) {
          close();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          navigate(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <button
        className={cx("lightbox-close")}
        type="button"
        aria-label="Fermer l’aperçu"
        onClick={close}
      >
        ×
      </button>
      <LightboxNavButton
        direction={-1}
        className="lightbox-prev"
        label="Image précédente"
        text="‹"
        hidden={props.stories.length < 2}
        onNavigate={navigate}
      />
      <div className={cx("lightbox-content")}>
        <div className={cx("lightbox-preview-panel")}>
          <div className={cx("lightbox-header")}>
            <img
              className={cx("lightbox-avatar")}
              alt=""
              src={props.story.avatar}
              hidden={props.story.avatar === undefined}
            />
            <div>
              <strong className="lightbox-username">{props.story.userName}</strong>
              <span className="lightbox-count">{selectedCount()}</span>
            </div>
          </div>
          <img className={cx("lightbox-image")} src={props.story.preview} alt={props.story.alt} />
        </div>
        <aside className={cx("lightbox-details-panel")} aria-label="Détails de la story">
          <h2>Détails</h2>
          <table className={cx("lightbox-details-table")}>
            <tbody>
              <LightboxDetailsRow
                label="Type"
                className="lightbox-detail-media-type"
                value={props.story.mediaType}
              />
              <LightboxDetailsRow
                label="Story"
                className="lightbox-detail-media-pk"
                value={props.story.mediaPk}
              />
              <LightboxDetailsRow
                label="Stickers"
                className="lightbox-detail-stickers"
                value={props.story.stickers}
              />
              <LightboxDetailsRow
                label="Lieux"
                className="lightbox-detail-locations"
                value={props.story.locations}
              />
              <LightboxDetailsRow
                label="Instagram"
                className="lightbox-detail-ig-caption"
                value={props.story.igCaption}
              />
              <LightboxDetailsRow
                label="Apple OCR"
                className="lightbox-detail-apple-caption"
                value={props.story.appleCaption}
              />
              <LightboxDetailsRow
                label="Vision OCR"
                className="lightbox-detail-vision-ocr"
                value={props.story.visionOcr}
              />
              <LightboxDetailsRow
                label="Vision description"
                className="lightbox-detail-vision-description"
                value={props.story.visionDescription}
              />
            </tbody>
          </table>
          <a
            className={cx("lightbox-story-link")}
            target="_blank"
            rel="noreferrer"
            href={props.story.url}
          >
            Voir cette story sur Instagram
          </a>
        </aside>
      </div>
      <LightboxNavButton
        direction={1}
        className="lightbox-next"
        label="Image suivante"
        text="›"
        hidden={props.stories.length < 2}
        onNavigate={navigate}
      />
    </dialog>
  );
}

export function Lightbox(props: { stories: Array<StoryCardViewModel>; selectedStory?: string }) {
  const story = props.stories.find((entry) => entry.mediaPk === props.selectedStory);
  return story === undefined ? null : <LightboxDialog stories={props.stories} story={story} />;
}
