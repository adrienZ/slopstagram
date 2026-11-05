import { useNavigate } from "@tanstack/react-router";
import type { SidebarUser } from "../loaders/sidebar-users.ts";
import type { TimelinePlace } from "../utils/timeline-locations.ts";

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

/** The map's account filter, kept in the `accounts` search param as a comma-separated list. */
export function usePlaceMapFilter(
  places: Array<TimelinePlace>,
  accounts: Array<SidebarUser>,
  value: string | undefined,
) {
  const navigate = useNavigate({ from: "/map" });
  const selected = keepAccounts(accounts, new Set(value?.split(",")));

  function select(usernames: Set<string>) {
    const next = keepAccounts(accounts, usernames);
    void navigate({
      to: ".",
      search: (previous) => ({
        ...previous,
        accounts: next.length === 0 ? undefined : next.join(","),
      }),
      replace: true,
      resetScroll: false,
    });
  }

  return {
    selected,
    places: filterPlaces(places, selected),
    toggle: (username: string) => {
      const next = new Set(selected);
      if (!next.delete(username)) {
        next.add(username);
      }
      select(next);
    },
    clear: () => {
      select(new Set());
    },
  };
}
