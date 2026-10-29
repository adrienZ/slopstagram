import { createRouter, parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import type { RouterContext } from "./pages/__root.tsx";
import { queries } from "./query-service.ts";
import { routeTree } from "./routeTree.gen.ts";

const applicationContext: RouterContext = { queries };

/** Creates the application router. Tests pass their own context to inject the data source. */
export function getRouter(context = applicationContext) {
  return createRouter({
    routeTree,
    context,
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
