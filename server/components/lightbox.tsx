import { useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import type { StoryCardViewModel } from "../story-card-view-model.ts";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../shadcn/ui/dialog.tsx";

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
      className={cn("lightbox-nav", props.className)}
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

function LightboxDialog(props: { stories: Array<StoryCardViewModel>; story: StoryCardViewModel }) {
  const navigateTo = useNavigate();

  function close() {
    void navigateTo({
      to: ".",
      search: (previous) => ({ ...previous, story: undefined }),
      replace: true,
      resetScroll: false,
    });
  }

  function navigate(direction: number) {
    const index = props.stories.findIndex((entry) => entry.mediaPk === props.story.mediaPk);
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

  function selectedCount() {
    return `${props.story.position} / ${props.story.count}`;
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <DialogContent
        className="image-lightbox tw:block tw:h-auto tw:max-h-[calc(100dvh-56px)] tw:w-[calc(100%-56px)] tw:max-w-none tw:gap-0 tw:rounded-lg tw:bg-transparent tw:p-0 tw:text-base tw:ring-0 tw:max-[760px]:max-h-[calc(100dvh-24px)] tw:max-[760px]:w-[calc(100%-24px)] tw:sm:max-w-none"
        id="image-lightbox"
        aria-describedby={undefined}
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          globalThis.document
            .querySelector<HTMLButtonElement>(
              `[data-story-preview="${globalThis.CSS.escape(props.story.mediaPk)}"]`,
            )
            ?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            navigate(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        <DialogTitle className="tw:sr-only">Aperçu de l’image</DialogTitle>
        <DialogClose asChild>
          <button className={cn("lightbox-close")} type="button" aria-label="Fermer l’aperçu">
            ×
          </button>
        </DialogClose>
        <LightboxNavButton
          direction={-1}
          className="lightbox-prev"
          label="Image précédente"
          text="‹"
          hidden={props.stories.length < 2}
          onNavigate={navigate}
        />
        <div className={cn("lightbox-content")}>
          <div className={cn("lightbox-preview-panel")}>
            <div className={cn("lightbox-header")}>
              <img
                className={cn("lightbox-avatar")}
                alt=""
                src={props.story.avatar}
                hidden={props.story.avatar === undefined}
              />
              <div>
                <strong className="lightbox-username">{props.story.userName}</strong>
                <span className="lightbox-count">{selectedCount()}</span>
              </div>
            </div>
            <img className={cn("lightbox-image")} src={props.story.preview} alt={props.story.alt} />
          </div>
          <aside className={cn("lightbox-details-panel")} aria-label="Détails de la story">
            <h2>Détails</h2>
            <table className={cn("lightbox-details-table")}>
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
              className={cn("lightbox-story-link")}
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
      </DialogContent>
    </Dialog>
  );
}

export function Lightbox(props: { stories: Array<StoryCardViewModel>; selectedStory?: string }) {
  const story = props.stories.find((entry) => entry.mediaPk === props.selectedStory);
  return story === undefined ? null : <LightboxDialog stories={props.stories} story={story} />;
}
