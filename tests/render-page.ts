import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToString } from "react-dom/server";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useSearch,
  parseSearchWith,
  stringifySearchWith,
  Outlet,
} from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { createRequestHandler, defaultRenderHandler } from "@tanstack/react-router/ssr/server";
import { RootDocument, rootHead } from "../server/pages/__root.tsx";
import { ThemeProvider } from "../server/components/theme-provider.tsx";

function FixtureThemeProvider() {
  return createElement(ThemeProvider, null, createElement(Outlet));
}

export function createPageRenderer<Props extends object>(
  Page: ComponentType<Props>,
  fileRoute: AnyRoute,
  props: Props,
  path: string,
) {
  function createFixtureRouter(requestProps: Props, contentOnly: boolean) {
    // Clone route definitions so concurrent requests never share fixture loader state.
    const root = contentOnly
      ? createRootRoute({ component: FixtureThemeProvider })
      : createRootRoute({
          shellComponent: RootDocument,
          head: rootHead,
        });
    const route = createRoute({
      ...fileRoute.options,
      getParentRoute: () => root,
      path,
      loader: () => requestProps,
    });
    if (contentOnly) {
      route.update({
        component: () =>
          createElement(Page, {
            ...requestProps,
            selectedStory: useSearch({ strict: false }).story,
          }),
      });
    }
    return createRouter({
      routeTree: root.addChildren([route]),
      parseSearch: parseSearchWith(String),
      stringifySearch: stringifySearchWith(JSON.stringify),
    });
  }

  return {
    render: async (url = path.replace("$username", "timeline-user")) => {
      const handler = createRequestHandler({
        request: new globalThis.Request(`http://localhost${url}`),
        createRouter: () => createFixtureRouter(props, true),
      });
      const response = await handler(
        ({ router, responseHeaders }) =>
          new globalThis.Response(renderToString(createElement(RouterProvider, { router })), {
            headers: responseHeaders,
          }),
      );
      return await response.text();
    },
    renderRoute: async (url: string, requestProps = props) => {
      const handler = createRequestHandler({
        request: new globalThis.Request(`http://localhost${url}`),
        createRouter: () => createFixtureRouter(requestProps, false),
      });
      const response = await handler(defaultRenderHandler);
      return await response.text();
    },
  };
}
