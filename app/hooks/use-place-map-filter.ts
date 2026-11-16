import { useNavigate } from "@tanstack/react-router";
import type { TimelinePlace } from "../utils/timeline-locations.ts";
import type { SidebarUser } from "../loaders/sidebar-users.ts";
import {
  formatAccountFilters,
  keepAccountFilters,
  parseAccountFilters,
  replaceViewSearch,
  toggleAccountFilter,
} from "../search-params.ts";

/** Each place keeps only the chosen accounts' stories, so its latest story is theirs. None chosen means all. */
function filterPlaces(places: Array<TimelinePlace>, selected: Array<string>): Array<TimelinePlace> {
  if (selected.length === 0) {
    return places;
  }

  const chosen = new Set(selected);

  return places.flatMap((place) => {
    const stories = place.stories.filter(({ username }) => chosen.has(username));

    return stories.length === 0 ? [] : [{ ...place, stories }];
  });
}

/**
 * The map's filters, kept in the search params: the accounts, a comma-separated list in
 * `accounts`, and the one place to show, by id in `place`. Both apply together. Unknown
 * accounts and an unknown place are ignored.
 */
export function usePlaceMapFilter(
  places: Array<TimelinePlace>,
  accounts: Array<SidebarUser>,
  search: { accounts?: string; place?: string },
) {
  const navigate = useNavigate({ from: "/map" });
  const selected = keepAccountFilters(accounts, parseAccountFilters(search.accounts));
  const place = places.find(({ id }) => id === search.place);

  function update(usernames: Array<string>, placeFilter: "keep" | "remove") {
    void navigate({
      ...replaceViewSearch,
      search: (previous) => ({
        ...previous,
        accounts: formatAccountFilters(keepAccountFilters(accounts, usernames)),
        place: placeFilter === "keep" ? previous.place : undefined,
      }),
    });
  }

  return {
    selected,
    place,
    places: filterPlaces(place === undefined ? places : [place], selected),
    toggle: (username: string) => {
      update(toggleAccountFilter(selected, username), "keep");
    },
    removePlace: () => {
      update(selected, "remove");
    },
    clear: () => {
      update([], "remove");
    },
  };
}
