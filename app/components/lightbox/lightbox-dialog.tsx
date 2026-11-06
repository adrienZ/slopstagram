import { Dialog, DialogClose, DialogContent, DialogTitle } from "../../shadcn/ui/dialog.tsx";
import { cn } from "cn";
import { useLightboxNavigation } from "../../hooks/use-lightbox-navigation.ts";
import type { StoryCardData } from "../../utils/story-cards.ts";
import { getUserTimelineUrl } from "../../utils/helper.ts";
import { LightboxDetails } from "./lightbox-details.tsx";

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

export function LightboxDialog(props: {
  stories: Array<StoryCardData>;
  story: StoryCardData;
  linkToProfile: boolean;
}) {
  const { close, navigate, isOpen } = useLightboxNavigation(props.stories, props.story);

  function selectedCount() {
    return `${props.story.position} / ${props.story.count}`;
  }

  return (
    <Dialog
      open={isOpen}
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
              className="tw:absolute tw:inset-0 tw:-z-10 tw:size-full tw:scale-110 tw:object-cover tw:blur-sm"
              data-testid="lightbox-backdrop"
              alt=""
              aria-hidden="true"
              src={props.story.preview}
            />
            <div
              className="tw:absolute tw:inset-0 tw:-z-10 tw:bg-foreground/50"
              aria-hidden="true"
            />
            <div className="tw:flex tw:items-center tw:gap-2.5 tw:bg-foreground/30 tw:px-3 tw:py-2.5 tw:text-background tw:backdrop-blur-3xl">
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
          <LightboxDetails story={props.story} />
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
