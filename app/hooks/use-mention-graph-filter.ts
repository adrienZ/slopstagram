import { useNavigate } from "@tanstack/react-router";
import { formatAccountFilters, replaceViewSearch, toggleAccountFilter } from "../search-params.ts";

/** Kept in the `accounts` search param so a link or a reload opens the same view. */
export function useMentionGraphFilter(selected: Array<string>) {
  const navigate = useNavigate({ from: "/graph" });

  function show(usernames: Array<string>) {
    void navigate({
      ...replaceViewSearch,
      search: { accounts: formatAccountFilters(usernames) },
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
