import "./i18n/index.ts";
import { createRouter, parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import { InternalError, NotFound } from "./components/router-fallbacks.tsx";
import { routeTree } from "./routeTree.gen.ts";

/** Everything the application router is configured with except its route tree, so tests can reuse it. */
export const routerOptions = {
  // Avoid JSON parsing of numeric Instagram IDs; route schemas normalize primitive values to strings.
  parseSearch: parseSearchWith(String),
  stringifySearch: stringifySearchWith(JSON.stringify),
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultErrorComponent: InternalError,
  defaultNotFoundComponent: NotFound,
} as const;

export function getRouter() {
  return createRouter({ routeTree, ...routerOptions });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
