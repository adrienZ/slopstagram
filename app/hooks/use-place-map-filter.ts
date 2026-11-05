import { useNavigate } from "@tanstack/react-router";
import type { TimelinePlace } from "../utils/timeline-locations.ts";
import type { SidebarUser } from "../loaders/sidebar-users.ts";

/** The usernames of the accounts in `chosen`, in account order; unknown names are dropped. */
function keepAccounts(accounts: Array<SidebarUser>, chosen: Set<string>): Array<string> {
  return accounts.flatMap(({ username }) => (chosen.has(username) ? [username] : []));
}

/**
 * The places at least one chosen account tagged, each keeping only those accounts' stories,
 * so that its latest story is the chosen accounts' latest. No chosen account means all of them.
 */
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
  const selected = keepAccounts(accounts, new Set(search.accounts?.split(",")));
  const place = places.find(({ id }) => id === search.place);

  /** Shows the chosen accounts, at the current place or at every place. */
  function update(usernames: Set<string>, placeFilter: "keep" | "remove") {
    const chosen = keepAccounts(accounts, usernames);
    void navigate({
      to: ".",
      search: (previous) => ({
        ...previous,
        accounts: chosen.length === 0 ? undefined : chosen.join(","),
        place: placeFilter === "keep" ? previous.place : undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  }

  return {
    selected,
    /** The place the map is narrowed to, before the accounts filter applies. */
    place,
    places: filterPlaces(place === undefined ? places : [place], selected),
    toggle: (username: string) => {
      const next = new Set(selected);
      if (!next.delete(username)) {
        next.add(username);
      }
      update(next, "keep");
    },
    removePlace: () => {
      update(new Set(selected), "remove");
    },
    clear: () => {
      update(new Set(), "remove");
    },
  };
}
