import { useNavigate } from "@tanstack/react-router";
import { formatAccountFilters, toggleAccountFilter } from "../utils/account-filter-search.ts";

/**
 * Adds and removes the graph's account filters, kept in the `accounts` search param so a link or
 * a reload opens the same view. `selected` are the filters the graph shows.
 */
export function useMentionGraphFilter(selected: Array<string>) {
  const navigate = useNavigate({ from: "/graph" });

  function show(usernames: Array<string>) {
    void navigate({
      to: ".",
      search: { accounts: formatAccountFilters(usernames) },
      replace: true,
      resetScroll: false,
    });
  }

  return {
    toggle: (username: string) => {
      show(toggleAccountFilter(selected, username));
    },
    clear: () => {
      show([]);
    },
  };
}
