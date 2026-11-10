/** The name of a place that has no name nor address, as the map shows it. */
const UNNAMED_PLACE = "Lieu sans nom";

/** The name shown for a Tagged place: its name, else its address, else the unnamed-place label. */
export function taggedPlaceDisplayName(place: {
  name: string | null;
  address: string | null;
}): string {
  return place.name ?? place.address ?? UNNAMED_PLACE;
}
