import { useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { TimelinePlace } from "../../utils/timeline-locations.ts";

export type Bounds = [[number, number], [number, number]];

export function getBounds(places: Array<TimelinePlace>): Bounds {
  const longitudes = places.map((place) => place.longitude);
  const latitudes = places.map((place) => place.latitude);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

export const fitBoundsOptions = { padding: 48, maxZoom: 13 };

/** Fits the view to the bounds once, when it mounts: keyed by the bounds, it re-fits on change. */
export function FitBounds({ bounds }: { bounds: Bounds }) {
  const { current: map } = useMap();
  const fitted = useRef(false);
  return (
    <span
      hidden
      ref={() => {
        if (!fitted.current && map !== undefined) {
          fitted.current = true;
          map.fitBounds(bounds, fitBoundsOptions);
        }
      }}
    />
  );
}
