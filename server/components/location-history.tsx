import { createContext, lazy, Suspense, useContext, useId, useRef, useState } from "react";
import type { ComponentType, KeyboardEvent } from "react";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import type { LocationMapCanvasProps } from "./location-map-canvas.tsx";
import { adjacentPlaceId, type TimelineLocations } from "../timeline-locations.ts";
import type { StoryCardViewModel } from "../story-card-view-model.ts";
import { formatStickerStoryDate } from "../timeline-stickers.ts";
import { StoryCard } from "./story-card.tsx";

const footerButtonClassName =
  "tw:cursor-pointer tw:rounded tw:p-1 tw:hover:bg-muted tw:focus-visible:outline-2 tw:focus-visible:outline-ring";

/**
 * Tests replace the WebGL map canvas, which jsdom lacks.
 * @public
 */
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
  const selectRef = useRef<HTMLSelectElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const LocationMapCanvas = useContext(LocationMapContext);
  const selected = locations.places.find((place) => place.id === selectedId);
  function closePreview() {
    setSelectedId(undefined);
    selectRef.current?.focus();
  }
  function selectAdjacent(step: 1 | -1) {
    const next =
      selectedId === undefined ? undefined : adjacentPlaceId(locations.places, selectedId, step);
    if (next === undefined) {
      return false;
    }
    setSelectedId(next);
    // The popup is replaced by the next one: keep keyboard focus on the marker.
    mapRef.current
      ?.querySelector<HTMLButtonElement>(`[data-place-id="${globalThis.CSS.escape(next)}"]`)
      ?.focus({ preventScroll: true });
    return true;
  }
  function navigateMarkers(event: KeyboardEvent<HTMLDivElement>) {
    const step: 1 | -1 | undefined = { ArrowRight: 1 as const, ArrowLeft: -1 as const }[event.key];
    if (step !== undefined && selectAdjacent(step)) {
      event.preventDefault();
    }
  }
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
        <>
          <div className="tw:flex tw:flex-col tw:gap-1">
            <label htmlFor={selectId} className="tw:text-sm">
              Choisir un lieu
            </label>
            <select
              ref={selectRef}
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
                  {[place.name, place.category, `${place.stories.length} stories`]
                    .filter((part) => part !== null)
                    .join(" · ")}
                </option>
              ))}
            </select>
          </div>
          {/* Arrow keys step through markers from the map and its popup, not the place select. */}
          <div ref={mapRef} onKeyDown={navigateMarkers}>
            <Suspense fallback={<p role="status">Chargement de la carte…</p>}>
              <LocationMapCanvas
                places={locations.places}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onClose={closePreview}
              >
                {selected !== undefined && (
                  <section
                    aria-label={`Stories du lieu : ${selected.name}`}
                    className="tw:max-h-52 tw:w-56 tw:space-y-2 tw:overflow-y-auto tw:text-foreground"
                  >
                    <div className="tw:flex tw:items-start tw:justify-between tw:gap-2">
                      <h3 className="tw:min-w-0 tw:text-sm tw:font-semibold tw:wrap-anywhere">
                        {selected.name}
                      </h3>
                      <button
                        type="button"
                        aria-label="Fermer les aperçus du lieu"
                        className="tw:shrink-0 tw:cursor-pointer tw:rounded tw:p-1 tw:hover:bg-muted tw:focus-visible:outline-2 tw:focus-visible:outline-ring"
                        onClick={closePreview}
                      >
                        <XIcon className="tw:size-4" />
                      </button>
                    </div>
                    <ul className="tw:grid tw:grid-cols-3 tw:gap-2">
                      {selected.stories.map((story) => {
                        const card = storyByMediaPk.get(story.mediaPk);
                        return (
                          <li key={story.mediaPk} className="tw:min-w-0 tw:space-y-1">
                            {card === undefined ? (
                              <span>Preview unavailable</span>
                            ) : (
                              <StoryCard story={card} size="gallery" />
                            )}
                            <time
                              className="tw:block tw:text-[10px] tw:text-muted-foreground"
                              dateTime={story.date}
                            >
                              {formatStickerStoryDate(story.date)}
                            </time>
                          </li>
                        );
                      })}
                    </ul>
                    {locations.places.length > 1 && (
                      <div className="tw:flex tw:justify-between">
                        <button
                          type="button"
                          aria-label="Lieu précédent"
                          className={footerButtonClassName}
                          onClick={() => {
                            selectAdjacent(-1);
                          }}
                        >
                          <ChevronLeftIcon className="tw:size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Lieu suivant"
                          className={footerButtonClassName}
                          onClick={() => {
                            selectAdjacent(1);
                          }}
                        >
                          <ChevronRightIcon className="tw:size-4" />
                        </button>
                      </div>
                    )}
                  </section>
                )}
              </LocationMapCanvas>
            </Suspense>
          </div>
        </>
      )}
    </section>
  );
}
