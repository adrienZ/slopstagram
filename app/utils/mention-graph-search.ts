/** The usernames the `/graph` page's `accounts` search param lists, comma-separated. */
export function parseAccountFilters(value: string | undefined): Array<string> {
  return value?.split(",").filter((username) => username !== "") ?? [];
}

/** The `accounts` search param listing `usernames`, absent when there is none. */
export function formatAccountFilters(usernames: Array<string>): string | undefined {
  return usernames.length === 0 ? undefined : usernames.join(",");
}
