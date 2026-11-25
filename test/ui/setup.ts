/* oxlint-disable max-classes-per-file -- Each browser API jsdom lacks gets its own small stand-in. */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import cssEscape from "css.escape";
import "../../app/i18n/index.ts";
import { setTheme } from "../../app/components/theme.ts";
import { defineJsdomPolyfill, mockJsdomPolyfillValue } from "../setup/define-property.ts";

// #region Media queries
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

beforeEach(() => {
  const queries = new Map<string, TestMediaQuery>();
  mockJsdomPolyfillValue(globalThis, "matchMedia", {
    value: (query: string) => {
      let media = queries.get(query);

      if (media === undefined) {
        media = new TestMediaQuery(query);
        queries.set(query, media);
      }

      return media;
    },
  });
});
// #endregion

// #region Layout
defineJsdomPolyfill(globalThis.Element.prototype, "scrollIntoView", {
  value() {
    // jsdom has no layout or viewport to scroll. Tests can spy on this boundary.
  },
});

// The router restores scroll positions on navigation, which jsdom reports as not implemented.
defineJsdomPolyfill(globalThis, "scrollTo", {
  value() {
    // jsdom has no layout or viewport to scroll. Tests can spy on this boundary.
  },
});

function ignoreResize() {
  // jsdom has no layout: sizes never change, so there is nothing to report or stop.
}

class TestResizeObserver {
  readonly observe = ignoreResize;
  readonly unobserve = ignoreResize;
  readonly disconnect = ignoreResize;
}

defineJsdomPolyfill(globalThis, "ResizeObserver", { value: TestResizeObserver });
// #endregion

// #region Media playback
// jsdom does not play media. The element reports its state like a browser would, and tests spy on play and pause.
async function play(this: HTMLMediaElement) {
  Object.defineProperty(this, "paused", { configurable: true, value: false });
  this.dispatchEvent(new globalThis.Event("play"));
  await globalThis.Promise.resolve();
}

function pause(this: HTMLMediaElement) {
  Object.defineProperty(this, "paused", { configurable: true, value: true });
  this.dispatchEvent(new globalThis.Event("pause"));
}

defineJsdomPolyfill(globalThis.HTMLMediaElement.prototype, "play", { value: play });

defineJsdomPolyfill(globalThis.HTMLMediaElement.prototype, "pause", { value: pause });
// #endregion

// #region Per-test page state
beforeEach(() => {
  mockJsdomPolyfillValue(globalThis, "CSS", { value: { escape: cssEscape } });
  setTheme("system");
  globalThis.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  globalThis.document.documentElement.className = "";
  globalThis.document.documentElement.style.colorScheme = "";
});
// #endregion
