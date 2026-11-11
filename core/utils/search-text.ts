/** A text as searches compare it: trimmed, lowercased and without accents. */
function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** A search query as searches compare it: normalized, without a leading `@`. */
export function normalizeSearchQuery(query: string): string {
  return normalizeForSearch(query).replace(/^@/u, "");
}

/**
 * How well a text matches a normalized query: 0 when it equals it, 1 when it starts with it,
 * 2 when it contains it, null otherwise. Lower is better.
 */
export function rankTextMatch(value: string, query: string): 0 | 1 | 2 | null {
  const text = normalizeForSearch(value);
  if (text === query) {
    return 0;
  }
  if (text.startsWith(query)) {
    return 1;
  }
  return text.includes(query) ? 2 : null;
}
