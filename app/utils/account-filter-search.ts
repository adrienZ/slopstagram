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
