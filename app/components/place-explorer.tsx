import { useTranslation } from "react-i18next";
import { Suspense, useContext, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { LocationMapCanvasProps } from "./location-map-canvas.tsx";
import { adjacentPlaceId, type TimelinePlace } from "../utils/timeline-locations.ts";
import type { StoryCardData } from "../utils/story-cards.ts";
import { LocationMapContext } from "./location-map-context.ts";
import { PlaceStories } from "./place-stories.tsx";

export function PlaceExplorer({
  places,
  initialSelectedId,
  storyByMediaPk,
  showOwner,
  renderMarker,
  mapClassName,
  tileErrorMessage,
}: {
  places: Array<TimelinePlace>;
  initialSelectedId?: string;
  storyByMediaPk: Map<string, StoryCardData>;
  showOwner?: boolean;
} & Pick<LocationMapCanvasProps, "renderMarker" | "tileErrorMessage"> & {
    mapClassName?: LocationMapCanvasProps["className"];
  }) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const selectId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const LocationMapCanvas = useContext(LocationMapContext);
  const selected = places.find((place) => place.id === selectedId);

  // A place hidden by a filter loses its selection, so it never reopens on its own.
  if (selectedId !== undefined && selected === undefined) {
    setSelectedId(undefined);
  }

  function closePreview() {
    setSelectedId(undefined);
    selectRef.current?.focus();
  }

  function selectAdjacent(step: 1 | -1) {
    const next = selected === undefined ? undefined : adjacentPlaceId(places, selected.id, step);

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
    <>
      <div className="tw:flex tw:flex-col tw:gap-1">
        <label htmlFor={selectId} className="tw:text-sm">
          {t("map.choosePlace")}
        </label>
        <select
          ref={selectRef}
          id={selectId}
          value={selected?.id ?? ""}
          className="tw:w-full tw:rounded-md tw:border tw:bg-background tw:p-2 tw:text-sm"
          onChange={(event) => {
            setSelectedId(event.target.value);
          }}
        >
          <option value="">{t("map.selectPlace")}</option>
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {[place.name, place.category, t("common.storyCount", { count: place.stories.length })]
                .filter((part) => part !== null)
                .join(" · ")}
            </option>
          ))}
        </select>
      </div>
      {/* Arrow keys step through markers from the map and its popup, not the place select. */}
      <div ref={mapRef} role="presentation" onKeyDown={navigateMarkers}>
        <Suspense fallback={<output>{t("map.loading")}</output>}>
          {/* oxlint-disable-next-line react/static-components -- Tests swap the map canvas through context; it never changes between renders. */}
          <LocationMapCanvas
            places={places}
            selectedId={selected?.id}
            onSelect={setSelectedId}
            onClose={closePreview}
            renderMarker={renderMarker}
            className={mapClassName}
            tileErrorMessage={tileErrorMessage}
          >
            {selected !== undefined && (
              <PlaceStories
                place={selected}
                storyByMediaPk={storyByMediaPk}
                showOwner={showOwner}
                onClose={closePreview}
                onStep={
                  places.length > 1
                    ? (step) => {
                        selectAdjacent(step);
                      }
                    : undefined
                }
              />
            )}
          </LocationMapCanvas>
        </Suspense>
      </div>
    </>
  );
}
