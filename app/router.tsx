import { createRouter, parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.ts";

/** Everything the application router is configured with except its route tree, so tests can reuse it. */
export const routerOptions = {
  // Avoid JSON parsing of numeric Instagram IDs; route schemas normalize primitive values to strings.
  parseSearch: parseSearchWith(String),
  stringifySearch: stringifySearchWith(JSON.stringify),
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultErrorComponent: () => <h1>500 : Erreur interne</h1>,
  defaultNotFoundComponent: () => <h1>404 : Page introuvable</h1>,
} as const;

export function getRouter() {
  return createRouter({ routeTree, ...routerOptions });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
