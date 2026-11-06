/**
 * https://syntax.fm/videos/syntax-side-dish-explainers/free-maps-for-any-app-replace-google-maps-today
 */

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import Map, {
  FullscreenControl,
  GeolocateControl,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
} from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "cn";
import type { TimelinePlace } from "../../utils/timeline-locations.ts";
import { FitBounds, fitBoundsOptions, getBounds } from "./fit-bounds.tsx";
import { PlaceMarker } from "./place-marker.tsx";

setWorkerUrl(workerUrl);

export interface LocationMapCanvasProps {
  places: Array<TimelinePlace>;
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  children?: ReactNode;
  /** The content of a place's marker. Defaults to a pin. */
  renderMarker?: (place: TimelinePlace) => ReactNode;
  /** Sizes the map. Defaults to a fixed height. */
  className?: string;
  /** Shown when the base map fails to load. */
  tileErrorMessage?: string;
}

export default function LocationMapCanvas({
  places,
  selectedId,
  onSelect,
  onClose,
  children,
  renderMarker,
  className = "tw:h-80 tw:sm:h-96",
  tileErrorMessage = "Fond de carte indisponible. Les lieux et le tableau restent accessibles.",
}: LocationMapCanvasProps) {
  const [failed, setFailed] = useState(false);
  const mapRef = useRef<MapRef>(null);
  const selected = places.find((place) => place.id === selectedId);
  const bounds = getBounds(places);
  const boundsKey = bounds.join(",");
  // The initial view already fits the places: re-fit only once they change, e.g. when filtered.
  const [fittedBoundsKey, setFittedBoundsKey] = useState(boundsKey);
  const [boundsChanged, setBoundsChanged] = useState(false);
  if (boundsKey !== fittedBoundsKey) {
    setFittedBoundsKey(boundsKey);
    setBoundsChanged(true);
  }
  return (
    <div
      role="region"
      aria-label="Carte des lieux"
      className={cn("tw:relative tw:overflow-hidden tw:rounded-lg tw:border", className)}
    >
      <Map
        ref={mapRef}
        initialViewState={{
          bounds,
          fitBoundsOptions,
        }}
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
        style={{ width: "100%", height: "100%" }}
        scrollZoom={false}
        onError={() => {
          setFailed(true);
        }}
      >
        <NavigationControl position="top-right" />
        <FullscreenControl position="top-right" />
        <GeolocateControl position="top-right" />
        <ScaleControl position="bottom-left" />
        {boundsChanged && <FitBounds key={boundsKey} bounds={bounds} />}
        {places.map((place) => (
          <Marker
            key={place.id}
            longitude={place.longitude}
            latitude={place.latitude}
            anchor="bottom"
          >
            <PlaceMarker
              place={place}
              selected={selectedId === place.id}
              renderMarker={renderMarker}
              onSelect={onSelect}
            />
          </Marker>
        ))}
        {selected !== undefined && (
          <Popup
            key={selected.id}
            longitude={selected.longitude}
            latitude={selected.latitude}
            anchor="bottom"
            offset={42}
            maxWidth="280px"
            closeButton={false}
            closeOnClick={false}
            className="tw:[&_.maplibregl-popup-content]:rounded-lg! tw:[&_.maplibregl-popup-content]:p-2! tw:[&_.maplibregl-popup-content]:bg-background! tw:[&_.maplibregl-popup-tip]:border-t-background!"
            onClose={onClose}
            onOpen={() => {
              const map = mapRef.current;
              if (map !== null) {
                map.easeTo({
                  center: [selected.longitude, selected.latitude],
                  offset: [0, map.getContainer().clientHeight / 2 - 24],
                  duration: 250,
                });
              }
            }}
          >
            {children}
          </Popup>
        )}
      </Map>
      {failed && (
        <p
          role="status"
          className="tw:absolute tw:top-2 tw:left-2 tw:max-w-2/3 tw:rounded tw:bg-background tw:p-2 tw:text-sm"
        >
          {tileErrorMessage}
        </p>
      )}
    </div>
  );
}
