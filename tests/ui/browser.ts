// jsdom has no media-query evaluation or layout. Keep these platform boundaries
// controllable while rendering the real router, Radix components, and providers.
class TestMediaQuery extends globalThis.EventTarget {
  readonly media: string;
  matches = false;

  constructor(media: string) {
    super();
    this.media = media;
  }

  setMatches(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(new globalThis.Event("change"));
  }

  addListener(listener: EventListener) {
    this.addEventListener("change", listener);
  }

  removeListener(listener: EventListener) {
    this.removeEventListener("change", listener);
  }
}

const queries = new Map<string, TestMediaQuery>();

export function matchMedia(query: string) {
  let media = queries.get(query);
  if (media === undefined) {
    media = new TestMediaQuery(query);
    queries.set(query, media);
  }
  return media;
}

export function resetMediaQueries() {
  for (const media of queries.values()) {
    media.setMatches(false);
  }
}
