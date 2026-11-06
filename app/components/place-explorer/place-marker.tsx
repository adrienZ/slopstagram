import type { ReactNode } from "react";
import { cn } from "cn";
import { MapPinIcon } from "lucide-react";
import type { TimelinePlace } from "../../utils/timeline-locations.ts";

/** The button of a place on the map: a pin, or the content `renderMarker` gives. */
export function PlaceMarker({
  place,
  selected,
  renderMarker,
  onSelect,
}: {
  place: TimelinePlace;
  selected: boolean;
  renderMarker?: (place: TimelinePlace) => ReactNode;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Voir le lieu : ${place.name}`}
      aria-pressed={selected}
      title={place.name}
      data-place-id={place.id}
      className={cn(
        "tw:cursor-pointer tw:rounded-full tw:border tw:border-white tw:shadow-md tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-ring tw:aria-pressed:ring-4 tw:aria-pressed:ring-ring",
        renderMarker === undefined && "tw:bg-primary tw:p-2 tw:text-primary-foreground",
      )}
      onClick={() => {
        onSelect(place.id);
      }}
    >
      {renderMarker === undefined ? <MapPinIcon className="tw:size-5" /> : renderMarker(place)}
    </button>
  );
}
