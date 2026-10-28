import { useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import type { StoryCardViewModel } from "../story-card-view-model.ts";
import { useState, type ReactNode } from "react";
import { Sticker } from "./sticker.tsx";
import { MusicSticker } from "./music-sticker.tsx";
import { getUserTimelineUrl } from "../helper.ts";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../shadcn/ui/dialog.tsx";

const detailsCellClassName =
  "tw:border tw:border-border tw:px-3 tw:py-2.75 tw:text-left tw:align-top tw:wrap-anywhere tw:whitespace-pre-wrap tw:max-[760px]:block tw:max-[760px]:w-auto tw:max-[760px]:border-0 tw:max-[760px]:px-2.5 tw:max-[760px]:py-2";

function LightboxDetailsRow(props: { label: string; value: ReactNode }) {
  return (
    <tr className="tw:max-[760px]:block">
      <th className={cn(detailsCellClassName, "tw:w-32 tw:bg-muted")} scope="row">
        {props.label}
      </th>
      <td className={detailsCellClassName}>{props.value ?? "—"}</td>
    </tr>
  );
}

function LightboxNavButton(props: {
  direction: number;
  label: string;
  text: string;
  hidden: boolean;
  onNavigate: (direction: number) => void;
}) {
  return (
    <button
      className={cn(
        "tw:absolute tw:top-1/2 tw:size-10.5 tw:cursor-pointer tw:rounded-lg tw:border tw:border-background/40 tw:bg-foreground/70 tw:text-[28px] tw:text-background",
        props.direction < 0 ? "tw:left-4" : "tw:right-4",
      )}
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

interface LightboxProps {
  stories: Array<StoryCardViewModel>;
  selectedStory?: string;
  linkToProfile?: boolean;
}

function LightboxDialog(props: {
  stories: Array<StoryCardViewModel>;
  story: StoryCardViewModel;
  linkToProfile: boolean;
}) {
  const navigateTo = useNavigate();
  const [dismissedStory, setDismissedStory] = useState<string | null>(null);

  function close() {
    setDismissedStory(props.story.mediaPk);
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
      open={dismissedStory !== props.story.mediaPk}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <DialogContent
        className="tw:block tw:h-auto tw:max-h-[calc(100dvh-56px)] tw:w-[calc(100%-56px)] tw:max-w-none tw:gap-0 tw:rounded-lg tw:bg-transparent tw:p-0 tw:text-base tw:ring-0 tw:max-[760px]:max-h-[calc(100dvh-24px)] tw:max-[760px]:w-[calc(100%-24px)] tw:sm:max-w-none"
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
          <button
            className="tw:absolute tw:top-4 tw:right-4 tw:z-1 tw:size-10.5 tw:cursor-pointer tw:rounded-lg tw:border tw:border-background/40 tw:bg-foreground/70 tw:text-[28px] tw:text-background"
            type="button"
            aria-label="Fermer l’aperçu"
          >
            ×
          </button>
        </DialogClose>
        <LightboxNavButton
          direction={-1}
          label="Image précédente"
          text="‹"
          hidden={props.stories.length < 2}
          onNavigate={navigate}
        />
        <div className="tw:mx-auto tw:flex tw:h-[min(900px,calc(100dvh-56px))] tw:w-full tw:overflow-hidden tw:rounded-lg tw:bg-foreground tw:max-[760px]:h-[calc(100dvh-24px)] tw:max-[760px]:flex-col">
          <div className="tw:relative tw:isolate tw:flex tw:max-w-[calc(100%-320px)] tw:flex-[0_1_auto] tw:flex-col tw:overflow-hidden tw:max-[760px]:min-h-0 tw:max-[760px]:max-w-none tw:max-[760px]:flex-[1_1_66%]">
            <img
              className="tw:absolute tw:inset-0 tw:-z-10 tw:size-full tw:scale-125 tw:object-cover tw:blur-2xl"
              data-testid="lightbox-backdrop"
              alt=""
              aria-hidden="true"
              src={props.story.preview}
            />
            <div
              className="tw:absolute tw:inset-0 tw:-z-10 tw:bg-foreground/50"
              aria-hidden="true"
            />
            <div className="tw:flex tw:items-center tw:gap-2.5 tw:px-3 tw:py-2.5 tw:text-background">
              <img
                className="tw:size-10.5 tw:rounded-lg tw:object-cover"
                alt=""
                src={props.story.avatar}
                hidden={props.story.avatar === undefined}
              />
              <div>
                {props.linkToProfile ? (
                  <a
                    className="tw:font-bold tw:text-inherit tw:underline-offset-2 tw:hover:underline"
                    href={getUserTimelineUrl(props.story.username)}
                  >
                    {props.story.userName}
                  </a>
                ) : (
                  <strong>{props.story.userName}</strong>
                )}
                <span>{selectedCount()}</span>
              </div>
            </div>
            <img
              className="tw:m-auto tw:h-auto tw:max-h-[calc(100%-62px)] tw:w-auto tw:max-w-full tw:object-contain"
              src={props.story.preview}
              alt={props.story.alt}
            />
          </div>
          <aside
            className="tw:flex-[1_1_360px] tw:overflow-auto tw:bg-muted tw:p-4.5 tw:text-foreground tw:max-[760px]:min-h-[34%] tw:max-[760px]:min-w-0 tw:max-[760px]:flex-[1_1_34%] tw:max-[760px]:p-3.5"
            aria-label="Détails de la story"
          >
            <h2 className="tw:my-5 tw:text-2xl tw:leading-normal tw:font-bold">Détails</h2>
            <table className="tw:w-full tw:table-fixed tw:border-collapse tw:bg-card tw:text-card-foreground tw:max-[760px]:block tw:max-[760px]:w-auto">
              <tbody className="tw:max-[760px]:block">
                <LightboxDetailsRow label="Type" value={props.story.mediaType} />
                <LightboxDetailsRow
                  label="Stickers"
                  value={
                    props.story.stickerDetails === undefined ? (
                      props.story.stickers
                    ) : (
                      <>
                        {props.story.stickerDetails.text}
                        <div className="tw:flex tw:flex-wrap tw:items-start tw:gap-1.5">
                          {props.story.stickerDetails.stickers?.map((sticker, index) => (
                            <Sticker key={`${sticker.kind}:${index}`} sticker={sticker} />
                          ))}
                          {props.story.stickerDetails.music.map(({ key, label, preview }) => (
                            <MusicSticker key={key} label={label} preview={preview} />
                          ))}
                        </div>
                      </>
                    )
                  }
                />
                <LightboxDetailsRow label="Lieux" value={props.story.locations} />
                <LightboxDetailsRow label="Instagram" value={props.story.igCaption} />
                <LightboxDetailsRow label="Apple OCR" value={props.story.appleCaption} />
                <LightboxDetailsRow label="Vision OCR" value={props.story.visionOcr} />
                <LightboxDetailsRow
                  label="Vision description"
                  value={props.story.visionDescription}
                />
              </tbody>
            </table>
            <a
              className="tw:mt-3.5 tw:inline-block tw:rounded-lg tw:bg-primary tw:px-3 tw:py-2.25 tw:text-primary-foreground tw:no-underline"
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
          label="Image suivante"
          text="›"
          hidden={props.stories.length < 2}
          onNavigate={navigate}
        />
      </DialogContent>
    </Dialog>
  );
}

export function Lightbox(props: LightboxProps) {
  const story = props.stories.find((entry) => entry.mediaPk === props.selectedStory);
  return story === undefined ? null : (
    <LightboxDialog
      stories={props.stories}
      story={story}
      linkToProfile={props.linkToProfile ?? false}
    />
  );
}
