export const PLACE_SEARCH_PARAM = "place";

export function buildPlaceMapHref(placeId: string): string {
  return `/map?${PLACE_SEARCH_PARAM}=${encodeURIComponent(placeId)}`;
}
