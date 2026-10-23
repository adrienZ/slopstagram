import {
  createRootRoute,
  createRoute,
  createRouter,
  parseSearchWith,
  stringifySearchWith,
} from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { createRequestHandler, defaultRenderHandler } from "@tanstack/react-router/ssr/server";
import { RootDocument, rootHead } from "../server/pages/__root.tsx";

export function createPageRenderer<Props extends object>(
  fileRoute: AnyRoute,
  props: Props,
  path: string,
) {
  return {
    renderRoute: async (url: string, requestProps = props) => {
      const handler = createRequestHandler({
        request: new globalThis.Request(`http://localhost${url}`),
        createRouter: () => {
          // Clone routes so concurrent SSR requests never share loader state.
          const root = createRootRoute({ shellComponent: RootDocument, head: rootHead });
          const route = createRoute({
            ...fileRoute.options,
            getParentRoute: () => root,
            path,
            loader: () => requestProps,
          });
          return createRouter({
            routeTree: root.addChildren([route]),
            parseSearch: parseSearchWith(String),
            stringifySearch: stringifySearchWith(JSON.stringify),
          });
        },
      });
      const response = await handler(defaultRenderHandler);
      return await response.text();
    },
  };
}
