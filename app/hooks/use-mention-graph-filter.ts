import { useNavigate } from "@tanstack/react-router";
import { formatAccountFilters, toggleAccountFilter } from "../utils/account-filter-search.ts";

/** Kept in the `accounts` search param so a link or a reload opens the same view. */
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
