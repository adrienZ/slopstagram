import { defineJsdomPolyfill } from "../setup/define-property.ts";

function ignore() {
  // jsdom has no layout: sizes never change, so there is nothing to report or stop.
}

class TestResizeObserver {
  readonly observe = ignore;
  readonly unobserve = ignore;
  readonly disconnect = ignore;
}

/** jsdom has no ResizeObserver: observers are accepted and never called back. */
export function installResizeObserver() {
  defineJsdomPolyfill(globalThis, "ResizeObserver", { value: TestResizeObserver });
}
