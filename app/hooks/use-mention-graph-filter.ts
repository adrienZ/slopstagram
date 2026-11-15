import { useNavigate } from "@tanstack/react-router";
import {
  formatAccountFilters,
  replaceFilterSearch,
  toggleAccountFilter,
} from "../utils/account-filter-search.ts";

/** Kept in the `accounts` search param so a link or a reload opens the same view. */
export function useMentionGraphFilter(selected: Array<string>) {
  const navigate = useNavigate({ from: "/graph" });

  function show(usernames: Array<string>) {
    void navigate({
      ...replaceFilterSearch,
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
