import { Link } from "@solidjs/meta";
import { useSearchParams } from "@solidjs/router";
import { createMemo, onCleanup, onMount } from "solid-js";
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
      <td class={props.className}>{props.value ?? "—"}</td>
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
      class={cx("lightbox-nav", props.className)}
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

export function LightboxStyles() {
  return <Link rel="stylesheet" href="/css/lightbox.css" />;
}

function LightboxDialog(props: { stories: Array<StoryCardViewModel>; story: StoryCardViewModel }) {
  const [, setSearchParams] = useSearchParams();
  let dialog: HTMLDialogElement | undefined;

  function selectedCount() {
    return `${props.story.position} / ${props.story.count}`;
  }

  onMount(() => {
    dialog?.showModal();
  });
  onCleanup(() => {
    dialog?.close();
  });

  function close() {
    setSearchParams({ story: undefined }, { replace: true });
  }

  function navigate(direction: number) {
    if (props.stories.length === 0) {
      return;
    }
    const index = props.stories.findIndex((story) => story.mediaPk === props.story.mediaPk);
    setSearchParams(
      {
        story:
          props.stories[(index + direction + props.stories.length) % props.stories.length]?.mediaPk,
      },
      { replace: true },
    );
  }

  return (
    <dialog
      class={cx("image-lightbox")}
      id="image-lightbox"
      aria-label="Aperçu de l’image"
      ref={(element) => {
        dialog = element;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
      onClose={(event) => {
        if (event.currentTarget.isConnected) {
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
        class={cx("lightbox-close")}
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
      <div class={cx("lightbox-content")}>
        <div class={cx("lightbox-preview-panel")}>
          <div class={cx("lightbox-header")}>
            <img
              class={cx("lightbox-avatar")}
              alt=""
              src={props.story.avatar}
              hidden={props.story.avatar === undefined}
            />
            <div>
              <strong class="lightbox-username">{props.story.userName}</strong>
              <span class="lightbox-count">{selectedCount()}</span>
            </div>
          </div>
          <img class={cx("lightbox-image")} src={props.story.preview} alt={props.story.alt} />
        </div>
        <aside class={cx("lightbox-details-panel")} aria-label="Détails de la story">
          <h2>Détails</h2>
          <table class={cx("lightbox-details-table")}>
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
            class={cx("lightbox-story-link")}
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

export function Lightbox(props: { stories: Array<StoryCardViewModel> }) {
  const [searchParams] = useSearchParams();
  const selected = createMemo(
    () => props.stories.find((story) => story.mediaPk === searchParams.story) ?? null,
  );

  function renderDialog() {
    const story = selected();
    return story === null ? null : <LightboxDialog stories={props.stories} story={story} />;
  }

  return <>{renderDialog()}</>;
}
