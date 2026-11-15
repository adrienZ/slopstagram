export function parseAccountFilters(value: string | undefined): Array<string> {
  return value?.split(",").filter((username) => username !== "") ?? [];
}

export function formatAccountFilters(usernames: Array<string>): string | undefined {
  return usernames.length === 0 ? undefined : usernames.join(",");
}

export function toggleAccountFilter(selected: Array<string>, username: string): Array<string> {
  return selected.includes(username)
    ? selected.filter((selectedUsername) => selectedUsername !== username)
    : [...selected, username];
}

/** The `selected` usernames that name one of `accounts`, in account order. */
export function keepAccountFilters(
  accounts: Array<{ username: string }>,
  selected: Iterable<string>,
): Array<string> {
  const chosen = new Set(selected);
  return accounts.flatMap(({ username }) => (chosen.has(username) ? [username] : []));
}

/** Filters change the view, not the page: they replace the history entry and keep the scroll. */
export const replaceFilterSearch = { to: ".", replace: true, resetScroll: false } as const;
