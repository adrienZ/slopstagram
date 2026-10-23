import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import cssEscape from "css.escape";
import { matchMedia, resetMediaQueries } from "./browser.ts";
import { setTheme } from "../../server/theme.ts";

Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: matchMedia });
Object.defineProperty(globalThis, "CSS", { configurable: true, value: { escape: cssEscape } });
Object.defineProperty(globalThis.Element.prototype, "scrollIntoView", {
  configurable: true,
  value() {
    // jsdom has no layout or viewport to scroll. Tests can spy on this boundary.
  },
});

beforeEach(() => {
  resetMediaQueries();
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
