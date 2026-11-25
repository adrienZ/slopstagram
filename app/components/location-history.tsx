import { useTranslation } from "react-i18next";
import type { TimelineLocations } from "../utils/timeline-locations.ts";
import type { StoryCardData } from "../utils/story-cards.ts";
import { PlaceExplorer } from "./place-explorer.tsx";

export function LocationHistory({
  locations,
  storyByMediaPk,
}: {
  locations: TimelineLocations;
  storyByMediaPk: Map<string, StoryCardData>;
}) {
  const { t } = useTranslation();

  return (
    <section aria-label={t("locations.history")} className="tw:min-w-0 tw:space-y-3">
      <p className="tw:text-sm tw:text-muted-foreground">
        <span>{t("locations.placesOnMap", { count: locations.places.length })}</span>
        {" · "}
        <span>
          {t("locations.unpositionedStickers", { count: locations.unpositionedStickerCount })}
        </span>
        {" · "}
        <span>
          {t("locations.unpositionedLocations", { count: locations.unpositionedLocationCount })}
        </span>
      </p>
      {locations.places.length === 0 ? (
        <p>{t("locations.noCoordinates")}</p>
      ) : (
        <PlaceExplorer places={locations.places} storyByMediaPk={storyByMediaPk} />
      )}
    </section>
  );
}
