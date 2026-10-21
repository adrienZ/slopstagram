/* oxlint-disable oxc/no-this-in-exported-function -- mono-jsx binds `this` to the component's signal scope. */
import { css } from "mono-jsx/jsx-runtime";
import cx from "clsx";
import type { StoryCardViewModel } from "../story-card-view-model.ts";
import { serializeSignalData } from "../signal-json.ts";

export interface LightboxSignals {
  storyMediaPk: string;
  stories: Array<StoryCardViewModel>;
}

type LightboxNavigationScope = WithAppSignals<FC<{ direction: number }>, LightboxSignals>;

type LightboxScope = WithAppSignals<
  FC<
    { direction: number; selected: StoryCardViewModel | null; storiesJson: string },
    { dialog: HTMLDialogElement }
  >,
  LightboxSignals
>;

function LightboxDetailsRow(props: { label: string; className: string; value: string }) {
  return (
    <tr>
      <th>{props.label}</th>
      <td class={props.className}>{props.value}</td>
    </tr>
  );
}

function navigateLightbox(this: LightboxNavigationScope, event: KeyboardEvent | MouseEvent) {
  let { direction } = this;
  if (event instanceof globalThis.KeyboardEvent) {
    direction = 0;
    if (event.key === "ArrowLeft") {
      direction = -1;
    } else if (event.key === "ArrowRight") {
      direction = 1;
    }
  }
  if (direction === 0 || this.app.stories.length === 0) {
    return;
  }

  event.preventDefault();
  const index = this.app.stories.findIndex((story) => story.mediaPk === this.app.storyMediaPk);
  const next = (index + direction + this.app.stories.length) % this.app.stories.length;
  this.app.storyMediaPk = this.app.stories[next]?.mediaPk ?? "";
}

function LightboxNavButton(
  this: LightboxNavigationScope,
  props: { direction: number; className: string; label: string; text: string },
) {
  this.direction = props.direction;
  return (
    <button
      class={cx("lightbox-nav", props.className)}
      type="button"
      aria-label={props.label}
      hidden={this.$(() => this.app.stories.length < 2)}
      onClick={navigateLightbox}
    >
      {props.text}
    </button>
  );
}

export function LightboxStyles() {
  return (
    <style>{css`
      @import url("/css/lightbox.css");
    `}</style>
  );
}

export function Lightbox(this: LightboxScope, { stories }: { stories: Array<StoryCardViewModel> }) {
  this.init({ direction: 0, selected: null, storiesJson: serializeSignalData(stories) });
  this.effect(() => {
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- The server serialized the typed story props into this signal.
    const hydratedStories: Array<StoryCardViewModel> = JSON.parse(this.storiesJson);
    this.app.stories = hydratedStories;
    this.app.storyMediaPk =
      new globalThis.URL(globalThis.location.href).searchParams.get("story") ?? "";
  });

  this.effect(() => {
    const selected =
      this.app.stories.find((story) => story.mediaPk === this.app.storyMediaPk) ?? null;
    this.selected = selected;

    const { dialog } = this.refs;
    if (selected === null) {
      dialog.close();
    } else if (!dialog.open) {
      dialog.showModal();
    }

    const url = new globalThis.URL(globalThis.location.href);
    if (selected === null) {
      url.searchParams.delete("story");
    } else {
      url.searchParams.set("story", selected.mediaPk);
    }
    if (url.href !== globalThis.location.href) {
      globalThis.history.replaceState(null, "", url);
    }
  });

  return (
    <dialog
      class={cx("image-lightbox")}
      id="image-lightbox"
      aria-label="Aperçu de l’image"
      ref={this.refs.dialog}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          this.refs.dialog.close();
        }
      }}
      onClose={() => {
        this.app.storyMediaPk = "";
      }}
      onKeyDown={navigateLightbox}
    >
      <button
        class={cx("lightbox-close")}
        type="button"
        aria-label="Fermer l’aperçu"
        onClick={() => {
          this.refs.dialog.close();
        }}
      >
        ×
      </button>
      <LightboxNavButton
        direction={-1}
        className="lightbox-prev"
        label="Image précédente"
        text="‹"
      />
      <div class={cx("lightbox-content")}>
        <div class={cx("lightbox-preview-panel")}>
          <div class={cx("lightbox-header")}>
            <img
              class={cx("lightbox-avatar")}
              alt=""
              src={this.$(() => this.selected?.avatar)}
              hidden={this.$(() => this.selected?.avatar === undefined)}
            />
            <div>
              <strong class="lightbox-username">
                {this.$(() => this.selected?.userName ?? "")}
              </strong>
              <span class="lightbox-count">
                {this.$(() =>
                  this.selected === null
                    ? ""
                    : `${this.selected.position} / ${this.selected.count}`,
                )}
              </span>
            </div>
          </div>
          <img
            class={cx("lightbox-image")}
            src={this.$(() => this.selected?.preview)}
            alt={this.$(() => this.selected?.alt ?? "")}
          />
        </div>
        <aside class={cx("lightbox-details-panel")} aria-label="Détails de la story">
          <h2>Détails</h2>
          <table class={cx("lightbox-details-table")}>
            <tbody>
              <LightboxDetailsRow
                label="Type"
                className="lightbox-detail-media-type"
                value={this.$(() => this.selected?.mediaType ?? "—")}
              />
              <LightboxDetailsRow
                label="Story"
                className="lightbox-detail-media-pk"
                value={this.$(() => this.selected?.mediaPk ?? "—")}
              />
              <LightboxDetailsRow
                label="Stickers"
                className="lightbox-detail-stickers"
                value={this.$(() => this.selected?.stickers ?? "—")}
              />
              <LightboxDetailsRow
                label="Lieux"
                className="lightbox-detail-locations"
                value={this.$(() => this.selected?.locations ?? "—")}
              />
              <LightboxDetailsRow
                label="Instagram"
                className="lightbox-detail-ig-caption"
                value={this.$(() => this.selected?.igCaption ?? "—")}
              />
              <LightboxDetailsRow
                label="Apple OCR"
                className="lightbox-detail-apple-caption"
                value={this.$(() => this.selected?.appleCaption ?? "—")}
              />
              <LightboxDetailsRow
                label="Vision OCR"
                className="lightbox-detail-vision-ocr"
                value={this.$(() => this.selected?.visionOcr ?? "—")}
              />
              <LightboxDetailsRow
                label="Vision description"
                className="lightbox-detail-vision-description"
                value={this.$(() => this.selected?.visionDescription ?? "—")}
              />
            </tbody>
          </table>
          <a
            class={cx("lightbox-story-link")}
            target="_blank"
            rel="noreferrer"
            href={this.$(() => this.selected?.url)}
            hidden={this.$(() => this.selected?.url === undefined)}
          >
            Voir cette story sur Instagram
          </a>
        </aside>
      </div>
      <LightboxNavButton direction={1} className="lightbox-next" label="Image suivante" text="›" />
    </dialog>
  );
}
