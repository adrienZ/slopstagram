import { useState } from "react";
import Map, { Marker, NavigationControl } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPinIcon } from "lucide-react";
import type { TimelinePlace } from "../timeline-locations.ts";

setWorkerUrl(workerUrl);

export interface LocationMapCanvasProps {
  places: Array<TimelinePlace>;
  selectedId?: string;
  onSelect: (id: string) => void;
}

export default function LocationMapCanvas({
  places,
  selectedId,
  onSelect,
}: LocationMapCanvasProps) {
  const [failed, setFailed] = useState(false);
  const longitudes = places.map((place) => place.longitude);
  const latitudes = places.map((place) => place.latitude);
  return (
    <div
      role="region"
      aria-label="Carte des lieux"
      className="tw:relative tw:h-80 tw:overflow-hidden tw:rounded-lg tw:border tw:sm:h-96"
    >
      <Map
        initialViewState={{
          bounds: [
            [Math.min(...longitudes), Math.min(...latitudes)],
            [Math.max(...longitudes), Math.max(...latitudes)],
          ],
          fitBoundsOptions: { padding: 48, maxZoom: 13 },
        }}
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
        style={{ width: "100%", height: "100%" }}
        scrollZoom={false}
        onError={() => {
          setFailed(true);
        }}
      >
        <NavigationControl position="top-right" />
        {places.map((place) => (
          <Marker
            key={place.id}
            longitude={place.longitude}
            latitude={place.latitude}
            anchor="bottom"
          >
            <button
              type="button"
              aria-label={`Voir le lieu : ${place.name}`}
              aria-pressed={selectedId === place.id}
              title={place.name}
              className="tw:cursor-pointer tw:rounded-full tw:border tw:border-white tw:bg-primary tw:p-2 tw:text-primary-foreground tw:shadow-md tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-ring tw:aria-pressed:ring-4 tw:aria-pressed:ring-ring"
              onClick={() => {
                onSelect(place.id);
              }}
            >
              <MapPinIcon className="tw:size-5" />
            </button>
          </Marker>
        ))}
      </Map>
      {failed && (
        <p
          role="status"
          className="tw:absolute tw:top-2 tw:left-2 tw:max-w-2/3 tw:rounded tw:bg-background tw:p-2 tw:text-sm"
        >
          Fond de carte indisponible. Les lieux et le tableau restent accessibles.
        </p>
      )}
    </div>
  );
}
