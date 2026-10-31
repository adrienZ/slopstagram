import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { createRequestHandler, defaultRenderHandler } from "@tanstack/react-router/ssr/server";
import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import { ThemeProvider } from "../server/components/theme-provider.tsx";
import { RootDocument, rootHead } from "../server/pages/__root.tsx";
import { routerOptions } from "../server/router.tsx";

type LoaderContext<Route extends AnyRoute> = Parameters<
  Extract<NonNullable<Route["options"]["loader"]>, (context: never) => object | Promise<object>>
>[0];

/** The loader's data, or a function computing it from the loader context the route builds (deps, route context). */
type PageProps<Route extends AnyRoute, Props extends object> =
  | Props
  | ((context: LoaderContext<Route>) => Props);

/**
 * Renders a real file route with its component, head, search validation and beforeLoad,
 * answering only its loader with `props`, or with what `props` computes from the loader
 * context: the server function behind a loader cannot run outside the Start runtime. Pair `renderRoute` (HTML string) or `mountRoute` (jsdom DOM)
 * with Testing Library.
 */
export function createPageRenderer<Route extends AnyRoute, Props extends object>(
  fileRoute: Route,
  props: PageProps<Route, Props>,
  path: string,
) {
  // Clone routes so concurrent renders never share loader state.
  function cloneRoute(
    root: AnyRoute,
    requestProps: PageProps<Route, Props>,
    beforeLoad?: () => Promise<void>,
  ) {
    return createRoute({
      ...fileRoute.options,
      // routeTree.gen.ts gives the real route an id; the clone gets a path instead.
      id: undefined,
      getParentRoute: () => root,
      path,
      loader: (context: LoaderContext<Route>) =>
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Props is an object type, so only the function form is callable.
        typeof requestProps === "function" ? requestProps(context) : requestProps,
      beforeLoad: async (context) => {
        await beforeLoad?.();
        // oxlint-disable-next-line typescript/no-unsafe-return, typescript/no-unsafe-call -- AnyRoute types the route's own beforeLoad as any.
        return await fileRoute.options.beforeLoad?.(context);
      },
    });
  }

  return {
    renderRoute: async (url: string, requestProps = props) => {
      const handler = createRequestHandler({
        request: new globalThis.Request(`http://localhost${url}`),
        createRouter: () => {
          const root = createRootRoute({ shellComponent: RootDocument, head: rootHead });
          return createRouter({
            routeTree: root.addChildren([cloneRoute(root, requestProps)]),
            ...routerOptions,
          });
        },
      });
      const response = await handler(defaultRenderHandler);
      return await response.text();
    },
    /**
     * Mounts the route in jsdom. `beforeLoad` runs ahead of the route's own, e.g. to hold a
     * navigation, and `wrapper` supplies context the page needs, e.g. a map canvas.
     */
    mountRoute: async (
      url: string,
      mountProps = props,
      options: {
        beforeLoad?: () => Promise<void>;
        wrapper?: ComponentType<{ children: ReactNode }>;
      } = {},
    ) => {
      const root = createRootRoute({
        component: () => createElement(ThemeProvider, null, createElement(Outlet)),
      });
      const router = createRouter({
        routeTree: root.addChildren([cloneRoute(root, mountProps, options.beforeLoad)]),
        history: createMemoryHistory({ initialEntries: [url] }),
        defaultPendingMinMs: 0,
        ...routerOptions,
      });
      await router.load();
      return {
        user: userEvent.setup(),
        router,
        ...render(createElement(RouterProvider, { router }), { wrapper: options.wrapper }),
      };
    },
  };
}
