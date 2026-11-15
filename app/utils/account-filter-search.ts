/** The usernames an `accounts` search param lists, comma-separated. */
export function parseAccountFilters(value: string | undefined): Array<string> {
  return value?.split(",").filter((username) => username !== "") ?? [];
}

/** The `accounts` search param listing `usernames`, absent when there is none. */
export function formatAccountFilters(usernames: Array<string>): string | undefined {
  return usernames.length === 0 ? undefined : usernames.join(",");
}

/** `selected` with `username` removed when it is there, added last otherwise. */
export function toggleAccountFilter(selected: Array<string>, username: string): Array<string> {
  return selected.includes(username)
    ? selected.filter((selectedUsername) => selectedUsername !== username)
    : [...selected, username];
}
