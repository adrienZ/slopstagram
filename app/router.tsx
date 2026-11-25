import { useTranslation } from "react-i18next";
import "./i18n/index.ts";
import { createRouter, parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.ts";

function InternalError() {
  const { t } = useTranslation();

  return <h1>{t("errors.internal")}</h1>;
}

function NotFound() {
  const { t } = useTranslation();

  return <h1>{t("errors.notFound")}</h1>;
}

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
