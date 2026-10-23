import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import cssEscape from "css.escape";
import { setTheme } from "../../server/theme.ts";

// jsdom does not evaluate media queries. Tests can spy on the native-shaped
// matches getter and dispatch change events without mocking application code.
class TestMediaQuery extends globalThis.EventTarget {
  readonly media: string;
  private readonly defaultMatches = false;

  constructor(media: string) {
    super();
    this.media = media;
  }

  get matches() {
    return this.defaultMatches;
  }
}

Object.defineProperty(globalThis.Element.prototype, "scrollIntoView", {
  configurable: true,
  value() {
    // jsdom has no layout or viewport to scroll. Tests can spy on this boundary.
  },
});

beforeEach(() => {
  const queries = new Map<string, TestMediaQuery>();
  vi.stubGlobal("matchMedia", (query: string) => {
    let media = queries.get(query);
    if (media === undefined) {
      media = new TestMediaQuery(query);
      queries.set(query, media);
    }
    return media;
  });
  vi.stubGlobal("CSS", { escape: cssEscape });
  setTheme("system");
  globalThis.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  globalThis.document.documentElement.className = "";
  globalThis.document.documentElement.style.colorScheme = "";
});
