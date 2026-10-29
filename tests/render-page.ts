import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  parseSearchWith,
  stringifySearchWith,
} from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { createRequestHandler, defaultRenderHandler } from "@tanstack/react-router/ssr/server";
import { RootDocument, rootHead } from "../server/pages/__root.tsx";
import type { RouterContext } from "../server/pages/__root.tsx";
import { inProcessQueries } from "./in-process-queries.ts";

/**
 * Server-renders a page route with its real loader. The loader runs the real
 * handlers over the application database; tests only replace the server
 * function transport, through the router context (see tests/in-process-queries.ts).
 */
export function createPageRenderer(fileRoute: AnyRoute, path: string) {
  return {
    renderRoute: async (url: string) => {
      const handler = createRequestHandler({
        request: new globalThis.Request(`http://localhost${url}`),
        createRouter: () => {
          // Clone routes so concurrent SSR requests never share loader state.
          const root = createRootRouteWithContext<RouterContext>()({
            shellComponent: RootDocument,
            head: rootHead,
          });
          const route = createRoute({
            ...fileRoute.options,
            getParentRoute: () => root,
            path,
          });
          return createRouter({
            routeTree: root.addChildren([route]),
            context: { queries: inProcessQueries },
            parseSearch: parseSearchWith(String),
            stringifySearch: stringifySearchWith(JSON.stringify),
          });
        },
      });
      return await handler(defaultRenderHandler);
    },
  };
}
