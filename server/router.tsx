import { createRouter, parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import { queries } from "./query-service.ts";
import { routeTree } from "./routeTree.gen.ts";

export function getRouter() {
  return createRouter({
    routeTree,
    context: { queries },
    // Avoid JSON parsing of numeric Instagram IDs; route schemas normalize primitive values to strings.
    parseSearch: parseSearchWith(String),
    stringifySearch: stringifySearchWith(JSON.stringify),
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultErrorComponent: () => <h1>500 : Erreur interne</h1>,
    defaultNotFoundComponent: () => <h1>404 : Page introuvable</h1>,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
