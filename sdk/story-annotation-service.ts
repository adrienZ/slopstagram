import { randomUUID } from "node:crypto";
import type { StoryAnnotations } from "./story-types.ts";
import type { StoryItem } from "./instagram-types.ts";
import {
  annotationSources,
  getStoryAnnotations,
  type getStoryAnnotationUpdates,
} from "./story-sticker-location-service.ts";

function mergeAnnotationUpdates(
  previous: StoryAnnotations,
  updates: ReturnType<typeof getStoryAnnotationUpdates>,
): StoryAnnotations {
  const replaced = new Set<string>(
    updates.filter((update) => update.preservePrevious !== true).map((update) => update.source),
  );
  const order: Array<string> = annotationSources.map(({ source }) => source);
  const completedKinds = new Set<string>(
    annotationSources
      .flatMap(({ kinds }) => [...kinds])
      .filter((kind) =>
        annotationSources.every(
          ({ source, kinds }) =>
            !kinds.some((candidate) => candidate === kind) || replaced.has(source),
        ),
      ),
  );
  const stickers = [
    ...previous.stickers.filter(
      (sticker) =>
        !replaced.has(sticker.source ?? "unknown") &&
        !((sticker.source ?? "unknown") === "unknown" && completedKinds.has(sticker.kind)) &&
        !updates.some(
          (update) =>
            update.preservePrevious === true &&
            update.source === sticker.source &&
            sticker.providerOccurrenceId !== undefined &&
            update.stickers.some(
              (incoming) =>
                incoming.providerOccurrenceId === sticker.providerOccurrenceId &&
                incoming.kind === sticker.kind,
            ),
        ),
    ),
    ...updates.flatMap((update) => update.stickers),
  ].toSorted(
    (left, right) =>
      order.indexOf(left.source ?? "unknown") - order.indexOf(right.source ?? "unknown"),
  );
  return {
    locations: stickers
      .filter((sticker) => sticker.kind === "location")
      .map((sticker) => sticker.label),
    stickers,
  };
}

export function planStoryAnnotations(
  previous: StoryAnnotations,
  story: StoryItem,
  updates: ReturnType<typeof getStoryAnnotationUpdates>,
) {
  const annotations =
    story.annotations === undefined
      ? mergeAnnotationUpdates(previous, updates)
      : getStoryAnnotations(story);
  const stickers = [...annotations.stickers];
  if (!stickers.some((sticker) => sticker.kind === "location")) {
    stickers.push(...annotations.locations.map((label) => ({ kind: "location", label })));
  }
  const used = new Set<string>();
  const stickerEntries = stickers.map((sticker, sortOrder) => {
    function sameProvider(candidate: StoryAnnotations["stickers"][number]): boolean {
      return (
        candidate.source === sticker.source &&
        candidate.kind === sticker.kind &&
        candidate.providerOccurrenceId === sticker.providerOccurrenceId
      );
    }
    const uniqueInternalId =
      stickers.filter((candidate) => candidate.occurrenceId === sticker.occurrenceId).length === 1;
    const explicit = previous.stickers.find(
      (candidate) =>
        uniqueInternalId &&
        candidate.occurrenceId === sticker.occurrenceId &&
        candidate.kind === sticker.kind &&
        (candidate.source === (sticker.source ?? "unknown") ||
          (story.annotations !== undefined &&
            (sticker.source === undefined || sticker.source === "unknown"))) &&
        candidate.providerOccurrenceId === sticker.providerOccurrenceId,
    );
    const candidates =
      sticker.providerOccurrenceId === undefined ? [] : previous.stickers.filter(sameProvider);
    const identified =
      candidates.length === 1 && stickers.filter(sameProvider).length === 1
        ? candidates[0]
        : undefined;
    const retainedId = (explicit ?? identified)?.occurrenceId;
    const occurrenceId =
      retainedId !== undefined && !used.has(retainedId) ? retainedId : randomUUID();
    used.add(occurrenceId);
    return {
      occurrenceId,
      providerOccurrenceId: sticker.providerOccurrenceId ?? null,
      kind: sticker.kind,
      // Raw source extraction already produces content-only labels. Explicit
      // annotations may come from older callers that still add the kind prefix.
      label:
        story.annotations !== undefined && sticker.label.startsWith(`${sticker.kind}:`)
          ? sticker.label.slice(sticker.kind.length + 1)
          : sticker.label,
      source:
        (sticker.source === undefined || sticker.source === "unknown") && explicit !== undefined
          ? (explicit.source ?? "unknown")
          : (sticker.source ?? "unknown"),
      mediaPk: story.pk,
      sortOrder,
    };
  });
  return { annotations, stickerEntries };
}
