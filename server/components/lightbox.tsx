import { Link } from "@solidjs/meta";
import { createEffect, createSignal, onMount } from "solid-js";
import cx from "clsx";
import { useStore } from "@nanostores/solid";
import { $storyMediaPk } from "../store.ts";
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

export function Lightbox({ stories }: { stories: Array<StoryCardViewModel> }) {
  const mediaPk = useStore($storyMediaPk);
  const [ready, setReady] = createSignal(false);
  onMount(() => {
    $storyMediaPk.set(new globalThis.URL(globalThis.location.href).searchParams.get("story") ?? "");
    setReady(true);
  });
  let dialog: HTMLDialogElement | undefined;
  function selected() {
    return stories.find((story) => story.mediaPk === mediaPk()) ?? null;
  }

  function selectedCount() {
    const story = selected();
    return story === null ? "" : `${story.position} / ${story.count}`;
  }

  createEffect(() => {
    if (!ready()) {
      return;
    }
    if (selected() === null) {
      dialog?.close();
    } else if (dialog !== undefined && !dialog.open) {
      dialog.showModal();
    }
    const url = new globalThis.URL(globalThis.location.href);
    const story = selected();
    if (story === null) {
      url.searchParams.delete("story");
    } else {
      url.searchParams.set("story", story.mediaPk);
    }
    if (url.href !== globalThis.location.href) {
      globalThis.history.replaceState(null, "", url);
    }
  });

  function navigate(direction: number) {
    if (stories.length === 0) {
      return;
    }
    const index = stories.findIndex((story) => story.mediaPk === mediaPk());
    $storyMediaPk.set(
      stories[(index + direction + stories.length) % stories.length]?.mediaPk ?? "",
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
          $storyMediaPk.set("");
        }
      }}
      onClose={() => {
        $storyMediaPk.set("");
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
        onClick={() => {
          $storyMediaPk.set("");
        }}
      >
        ×
      </button>
      <LightboxNavButton
        direction={-1}
        className="lightbox-prev"
        label="Image précédente"
        text="‹"
        hidden={stories.length < 2}
        onNavigate={navigate}
      />
      <div class={cx("lightbox-content")}>
        <div class={cx("lightbox-preview-panel")}>
          <div class={cx("lightbox-header")}>
            <img
              class={cx("lightbox-avatar")}
              alt=""
              src={selected()?.avatar}
              hidden={selected()?.avatar === undefined}
            />
            <div>
              <strong class="lightbox-username">{selected()?.userName ?? ""}</strong>
              <span class="lightbox-count">{selectedCount()}</span>
            </div>
          </div>
          <img class={cx("lightbox-image")} src={selected()?.preview} alt={selected()?.alt ?? ""} />
        </div>
        <aside class={cx("lightbox-details-panel")} aria-label="Détails de la story">
          <h2>Détails</h2>
          <table class={cx("lightbox-details-table")}>
            <tbody>
              <LightboxDetailsRow
                label="Type"
                className="lightbox-detail-media-type"
                value={selected()?.mediaType}
              />
              <LightboxDetailsRow
                label="Story"
                className="lightbox-detail-media-pk"
                value={selected()?.mediaPk}
              />
              <LightboxDetailsRow
                label="Stickers"
                className="lightbox-detail-stickers"
                value={selected()?.stickers}
              />
              <LightboxDetailsRow
                label="Lieux"
                className="lightbox-detail-locations"
                value={selected()?.locations}
              />
              <LightboxDetailsRow
                label="Instagram"
                className="lightbox-detail-ig-caption"
                value={selected()?.igCaption}
              />
              <LightboxDetailsRow
                label="Apple OCR"
                className="lightbox-detail-apple-caption"
                value={selected()?.appleCaption}
              />
              <LightboxDetailsRow
                label="Vision OCR"
                className="lightbox-detail-vision-ocr"
                value={selected()?.visionOcr}
              />
              <LightboxDetailsRow
                label="Vision description"
                className="lightbox-detail-vision-description"
                value={selected()?.visionDescription}
              />
            </tbody>
          </table>
          <a
            class={cx("lightbox-story-link")}
            target="_blank"
            rel="noreferrer"
            href={selected()?.url}
            hidden={selected()?.url === undefined}
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
        hidden={stories.length < 2}
        onNavigate={navigate}
      />
    </dialog>
  );
}
