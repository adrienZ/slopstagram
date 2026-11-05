/** The `/map` search param holding the id of the one Tagged place to show. */
export const PLACE_SEARCH_PARAM = "place";

/** The `/map` page showing only this Tagged place, with its popup open. */
export function buildPlaceMapHref(placeId: string): string {
  return `/map?${PLACE_SEARCH_PARAM}=${encodeURIComponent(placeId)}`;
}
