import { InfoIcon } from "lucide-react";
import type { OutdatedVision } from "@@/core/domains/vision/vision-analysis.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../shadcn/ui/dialog.tsx";

const HASH_PREVIEW_LENGTH = 12;

/** A vision field label, with the details of its analysis when it is outdated. */
export function VisionLabel(props: { label: string; outdated?: OutdatedVision }) {
  if (props.outdated === undefined) {
    return props.label;
  }
  const { currentModel, currentPromptHash, model, promptHash } = props.outdated;
  return (
    <span className="tw:inline-flex tw:items-center tw:gap-1.5">
      {props.label}
      <Dialog>
        <DialogTrigger asChild>
          <button
            className="tw:cursor-pointer tw:text-muted-foreground"
            type="button"
            aria-label="Analyse obsolète"
          >
            <InfoIcon className="tw:size-3.5" />
          </button>
        </DialogTrigger>
        <DialogContent className="tw:max-w-sm">
          <DialogHeader>
            <DialogTitle>Analyse obsolète</DialogTitle>
            <DialogDescription>
              Cette analyse n’a pas été produite avec le modèle et le prompt actuels.
            </DialogDescription>
          </DialogHeader>
          <dl className="tw:grid tw:grid-cols-[auto_1fr] tw:gap-x-3 tw:gap-y-1 tw:text-sm">
            <dt className="tw:text-muted-foreground">Modèle</dt>
            <dd>{model}</dd>
            <dt className="tw:text-muted-foreground">Modèle actuel</dt>
            <dd>{currentModel}</dd>
            <dt className="tw:text-muted-foreground">Prompt</dt>
            <dd className="tw:font-mono">{promptHash.slice(0, HASH_PREVIEW_LENGTH)}</dd>
            <dt className="tw:text-muted-foreground">Prompt actuel</dt>
            <dd className="tw:font-mono">{currentPromptHash.slice(0, HASH_PREVIEW_LENGTH)}</dd>
          </dl>
        </DialogContent>
      </Dialog>
    </span>
  );
}
