import { createContext, lazy, Suspense, useContext, useId, useState } from "react";
import type { ComponentType } from "react";
import type { LocationMapCanvasProps } from "./location-map-canvas.tsx";
import type { TimelineLocations } from "../timeline-locations.ts";
import type { StoryCardViewModel } from "../story-card-view-model.ts";
import { formatStickerStoryDate } from "../timeline-stickers.ts";
import { StoryCard } from "./story-card.tsx";

export const LocationMapContext = createContext<ComponentType<LocationMapCanvasProps>>(
  lazy(async () => await import("./location-map-canvas.tsx")),
);

export function LocationHistory({
  locations,
  storyByMediaPk,
}: {
  locations: TimelineLocations;
  storyByMediaPk: Map<string, StoryCardViewModel>;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const selectId = useId();
  const LocationMapCanvas = useContext(LocationMapContext);
  const selected = locations.places.find((place) => place.id === selectedId);
  return (
    <section aria-label="Lieux de l’historique" className="tw:min-w-0 tw:space-y-3">
      <p className="tw:text-sm tw:text-muted-foreground">
        {locations.places.length} lieux sur la carte · {locations.unpositionedCount} localisations
        sans coordonnées
      </p>
      {locations.places.length === 0 ? (
        <p>Aucun lieu avec des coordonnées. Les stickers restent disponibles dans le tableau.</p>
      ) : (
        <>
          <div className="tw:flex tw:flex-col tw:gap-1">
            <label htmlFor={selectId} className="tw:text-sm">
              Choisir un lieu
            </label>
            <select
              id={selectId}
              value={selectedId ?? ""}
              className="tw:w-full tw:rounded-md tw:border tw:bg-background tw:p-2 tw:text-sm"
              onChange={(event) => {
                setSelectedId(event.target.value);
              }}
            >
              <option value="">Sélectionnez un lieu…</option>
              {locations.places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name} · {place.stories.length} stories
                </option>
              ))}
            </select>
          </div>
          <Suspense fallback={<p role="status">Chargement de la carte…</p>}>
            <LocationMapCanvas
              places={locations.places}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </Suspense>
          {selected === undefined ? (
            <p className="tw:text-sm tw:text-muted-foreground">
              Sélectionnez un lieu pour retrouver ses stories.
            </p>
          ) : (
            <section aria-label={`Stories du lieu : ${selected.name}`} className="tw:space-y-2">
              <h3 className="tw:font-semibold">{selected.name}</h3>
              <p className="tw:text-sm tw:text-muted-foreground">
                {selected.stories.length} stories
              </p>
              <ul className="tw:flex tw:flex-wrap tw:gap-4">
                {selected.stories.map((story) => {
                  const card = storyByMediaPk.get(story.mediaPk);
                  return (
                    <li key={story.mediaPk} className="tw:flex tw:items-center tw:gap-2">
                      {card === undefined ? (
                        <span>Preview unavailable</span>
                      ) : (
                        <StoryCard story={card} size="sticker" />
                      )}
                      <time className="tw:text-xs" dateTime={story.date}>
                        {formatStickerStoryDate(story.date)}
                      </time>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}
