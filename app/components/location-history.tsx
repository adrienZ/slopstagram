import type { TimelineLocations } from "../utils/timeline-locations.ts";
import type { StoryCardData } from "../utils/story-cards.ts";
import { PlaceExplorer } from "./place-explorer/place-explorer.tsx";

export function LocationHistory({
  locations,
  storyByMediaPk,
}: {
  locations: TimelineLocations;
  storyByMediaPk: Map<string, StoryCardData>;
}) {
  return (
    <section aria-label="Lieux de l’historique" className="tw:min-w-0 tw:space-y-3">
      <p className="tw:text-sm tw:text-muted-foreground">
        <span>
          {locations.places.length} lieu{locations.places.length === 1 ? "" : "x"} sur la carte
        </span>
        {" · "}
        <span>
          {locations.unpositionedStickerCount} sticker
          {locations.unpositionedStickerCount === 1 ? "" : "s"} sans position confirmée
        </span>
        {" · "}
        <span>
          {locations.unpositionedLocationCount} localisation
          {locations.unpositionedLocationCount === 1 ? "" : "s"} sans coordonnées
        </span>
      </p>
      {locations.places.length === 0 ? (
        <p>Aucun lieu avec des coordonnées. Les stickers restent disponibles dans le tableau.</p>
      ) : (
        <PlaceExplorer places={locations.places} storyByMediaPk={storyByMediaPk} />
      )}
    </section>
  );
}
